import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { localRAG } from "@/lib/rag";
import { extractNGrams, jaccardSimilarity, cosineSimilarity } from "@/lib/similarity";

export const maxDuration = 120;

function splitp(text: string): string[] {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
  return cleaned.split(/[。！？；\n]+/).map(s => s.trim()).filter(s => s.length >= 8);
}

// 4-gram + 3-gram 混合相似度
function calcSim(a: string, b: string): number {
  const ca = a.replace(/\s+/g, ""), cb = b.replace(/\s+/g, "");
  if (ca.length < 5 || cb.length < 5) return 0;
  return jaccardSimilarity(extractNGrams(ca, 4), extractNGrams(cb, 4)) * 0.6
       + jaccardSimilarity(extractNGrams(ca, 3), extractNGrams(cb, 3)) * 0.4;
}

function rl(sim: number): "high" | "medium" | "low" {
  return sim >= 0.35 ? "high" : sim >= 0.10 ? "medium" : "low";
}

// ====== 常见学术套话检测 ======
const FORMULAIC_PATTERNS = [
  /随着[^。]{5,50}的发展/g, /近年来[^。]{3,60}/g, /得到了[^。]{3,50}的[关注|重视|应用]/g,
  /具有[^。]{3,40}的[意义|价值|作用]/g, /为[^。]{5,60}提供[了]?[^。]{3,40}/g,
  /国内外[^。]{5,80}/g, /综上所述[^。]{5,60}/g, /[研究|实验|实践]表明[^。]{5,60}/g,
  /是一种[^。]{3,50}的[方法|技术|途径]/g, /有效地[^。]{3,50}/g,
  /可以[有效|显著|明显][^。]{3,50}/g, /在[^。]{3,30}中起[着]?[^。]{3,30}作用/g,
  /目前[^。]{5,80}/g, /越来越[^。]{5,60}/g, /不可忽视[^。]{5,60}/g,
];

function detectFormulaic(text: string): { pattern: string; count: number }[] {
  const result: { pattern: string; count: number }[] = [];
  for (const re of FORMULAIC_PATTERNS) {
    const matches = text.match(re);
    if (matches && matches.length >= 2) {
      result.push({ pattern: re.source.slice(0, 30), count: matches.length });
    }
  }
  return result;
}

// ====== 长文本采样 ======
function sampleParagraphs(paras: string[], maxSamples = 60): string[] {
  if (paras.length <= maxSamples) return paras;
  const step = Math.floor(paras.length / maxSamples);
  const sampled: string[] = [];
  for (let i = 0; i < paras.length; i += step) {
    sampled.push(paras[i]);
    if (sampled.length >= maxSamples) break;
  }
  return sampled;
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, title, content } = await req.json();
    if (!title || !content) return Response.json({ error: "参数不完整" }, { status: 400 });
    if (content.length < 50) return Response.json({ error: "内容太短" }, { status: 400 });

    const allParagraphs = splitp(content);
    if (allParagraphs.length < 2) return Response.json({ error: "内容段落太少" }, { status: 400 });

    // 长文本采样，保证性能
    const paragraphs = sampleParagraphs(allParagraphs);
    const isLongText = allParagraphs.length > 60;

    const matches: any[] = [];
    const usedTexts = new Set<string>();

    // === 第一层：n-gram 精确/近似匹配（降低阈值）===

    // 1a. 自重复（阈值降到 0.18）
    for (let i = 0; i < paragraphs.length; i++) {
      for (let j = i + 1; j < Math.min(i + 15, paragraphs.length); j++) {
        const sim = calcSim(paragraphs[i], paragraphs[j]);
        if (sim >= 0.18) {
          matches.push({ sourceText: paragraphs[i], matchType: "self", matchedText: paragraphs[j], matchedFrom: "本文内部相似", similarity: sim, riskLevel: rl(sim) });
          usedTexts.add(paragraphs[i]);
          break;
        }
      }
    }

    // 1b. 跨项目
    const otherSections = await prisma.section.findMany({
      where: projectId ? { projectId: { not: projectId } } : {},
      select: { content: true, project: { select: { title: true } } },
      take: 200,
    });
    for (const p of paragraphs) {
      if (usedTexts.has(p)) continue;
      let best = { sim: 0, text: "", from: "" };
      for (const sec of otherSections) {
        if (!sec.content || sec.content.length < 20) continue;
        const sim = calcSim(p, sec.content.slice(0, 600));
        if (sim > best.sim) best = { sim, text: sec.content.slice(0, 300), from: sec.project?.title || "历史项目" };
      }
      if (best.sim >= 0.15) {
        matches.push({ sourceText: p, matchType: "cross", matchedText: best.text, matchedFrom: best.from, similarity: best.sim, riskLevel: rl(best.sim) });
        usedTexts.add(p);
      }
    }

    // 1c. 知识库
    const chunks = await prisma.knowledgeChunk.findMany({ select: { content: true, file: { select: { name: true } } }, take: 200 });
    for (const p of paragraphs) {
      if (usedTexts.has(p)) continue;
      let best = { sim: 0, text: "", from: "" };
      for (const chunk of chunks) {
        const sim = calcSim(p, chunk.content);
        if (sim > best.sim) best = { sim, text: chunk.content.slice(0, 300), from: chunk.file.name };
      }
      if (best.sim >= 0.15) {
        matches.push({ sourceText: p, matchType: "local", matchedText: best.text, matchedFrom: best.from, similarity: best.sim, riskLevel: rl(best.sim) });
        usedTexts.add(p);
      }
    }

    // === 第二层：Embedding 语义比对（仅比对未匹配段落）===
    let semanticMatches: any[] = [];
    try {
      const unmatched = paragraphs.filter(p => !usedTexts.has(p)).slice(0, 10);
      if (unmatched.length > 0 && chunks.length > 0) {
        for (const p of unmatched) {
          const pEmbed = await localRAG.getEmbedding(p);
          if (!pEmbed || pEmbed.length === 0) continue;
          let bestSim = 0, bestChunk = "";
          for (const chunk of chunks) {
            const cEmbed = await localRAG.getEmbedding(chunk.content.slice(0, 300));
            if (!cEmbed || cEmbed.length === 0) continue;
            const sim = cosineSimilarity(pEmbed, cEmbed);
            if (sim > bestSim) { bestSim = sim; bestChunk = chunk.content.slice(0, 300); }
          }
          if (bestSim > 0.7) {
            semanticMatches.push({ sourceText: p, matchType: "ai", matchedText: bestChunk, matchedFrom: "语义相似", similarity: bestSim * 0.5, riskLevel: "medium" });
          }
        }
      }
    } catch { /* embedding 失败不影响结果 */ }

    // === 第三层：学术套话检测 ===
    const formulaic = detectFormulaic(content);
    if (formulaic.length >= 2) {
      const patternTexts = formulaic.map(f => f.pattern).join("、");
      matches.push({
        sourceText: `【AI 分析】检测到 ${formulaic.length} 类常见学术套话模式（${formulaic.reduce((s, f) => s + f.count, 0)} 处）`,
        matchType: "ai",
        matchedText: formulaic.map(f => `"${f.pattern}" 出现 ${f.count} 次`).join("；"),
        matchedFrom: `套话分析：${patternTexts}`,
        similarity: 0.15,
        riskLevel: "medium",
      });
    }

    // 字数统计（超过 40% 的内容由高频句式组成视为风险）
    const highFreqSentenceLen = paragraphs
      .filter(p => p.length >= 15 && p.length <= 60)
      .reduce((s, p) => s + p.length, 0);
    const totalLen = paragraphs.reduce((s, p) => s + p.length, 0);
    const shortRatio = totalLen > 0 ? highFreqSentenceLen / totalLen : 0;
    if (shortRatio > 0.4 && isLongText) {
      matches.push({
        sourceText: `【AI 分析】短句式占比 ${(shortRatio * 100).toFixed(0)}%（短句式多为学术模板句，建议增补具体研究细节）`,
        matchType: "ai",
        matchedText: `建议：增加具体实验参数、数据指标等个性化内容，减少通用句式使用比例`,
        matchedFrom: "写作风格分析",
        similarity: 0.12,
        riskLevel: "low",
      });
    }

    // 入库
    const check = await prisma.plagiarismCheck.create({
      data: { projectId: projectId ?? null, title, content, status: "completed", completedAt: new Date() },
    });

    const deduped = Array.from(new Map(matches.map(m => [m.sourceText, m])).values())
      .sort((a, b) => b.similarity - a.similarity).slice(0, 50);

    for (const m of deduped) {
      await prisma.plagiarismMatch.create({
        data: { checkId: check.id, sourceText: m.sourceText.slice(0, 500), sourceOffset: 0, matchType: m.matchType, matchedText: m.matchedText.slice(0, 500), matchedFrom: m.matchedFrom.slice(0, 200), similarity: Math.round(m.similarity * 100) / 100, riskLevel: m.riskLevel },
      });
    }

    const maxSim = deduped.length ? Math.max(...deduped.map(m => m.similarity)) : 0;
    let or: "high" | "medium" | "low" = "low";
    if (maxSim > 0.35) or = "high";
    else if (maxSim > 0.12) or = "medium";
    else if (formulaic.length >= 3) or = "medium";
    else if (shortRatio > 0.5 && isLongText) or = "medium";

    await prisma.plagiarismCheck.update({ where: { id: check.id }, data: { maxSimilarity: maxSim, overallRisk: or } });

    return Response.json({
      checkId: check.id, totalMatches: deduped.length, maxSimilarity: maxSim,
      overallRisk: or,
      matches: deduped.map(m => ({ id: "", sourceText: m.sourceText.slice(0, 300), matchType: m.matchType, matchedText: m.matchedText.slice(0, 300), matchedFrom: m.matchedFrom.slice(0, 200), similarity: m.similarity, riskLevel: m.riskLevel })),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

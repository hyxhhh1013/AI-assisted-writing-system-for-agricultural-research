import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { extractNGrams, jaccardSimilarity } from "@/lib/similarity";
import { callAI } from "@/lib/ai";

export const maxDuration = 120;

// ====== n-gram 精确匹配（保留但降权） ======
function splitp(text: string): string[] {
  return text.replace(/<[^>]+>/g, "").split(/[。！？；\n]+/).map(s => s.trim()).filter(s => s.length >= 10);
}

function calcSim(a: string, b: string): number {
  const ca = a.replace(/\s+/g, ""), cb = b.replace(/\s+/g, "");
  if (ca.length < 5 || cb.length < 5) return 0;
  return jaccardSimilarity(extractNGrams(ca, 4), extractNGrams(cb, 4)) * 0.6
       + jaccardSimilarity(extractNGrams(ca, 3), extractNGrams(cb, 3)) * 0.4;
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, title, content } = await req.json();
    if (!title || !content) return Response.json({ error: "参数不完整" }, { status: 400 });
    if (content.length < 50) return Response.json({ error: "内容太短" }, { status: 400 });

    const paragraphs = splitp(content);
    const matches: any[] = [];

    // === 1. n-gram 本地匹配（跨项目 + 知识库） ===
    const [otherSections, chunks] = await Promise.all([
      prisma.section.findMany({
        where: projectId ? { projectId: { not: projectId } } : {},
        select: { content: true, project: { select: { title: true } } },
        take: 200,
      }),
      prisma.knowledgeChunk.findMany({ select: { content: true, file: { select: { name: true } } }, take: 200 }),
    ]);

    for (const p of paragraphs) {
      // 跨项目
      for (const sec of otherSections) {
        if (!sec.content || sec.content.length < 20) continue;
        const sim = calcSim(p, sec.content.slice(0, 600));
        if (sim >= 0.25) {
          matches.push({ sourceText: p, matchType: "cross", matchedText: sec.content.slice(0, 300), matchedFrom: sec.project?.title || "历史项目", similarity: sim, riskLevel: "high" });
          break;
        }
      }
      // 知识库
      if (!matches.some(m => m.sourceText === p)) {
        for (const chunk of chunks) {
          const sim = calcSim(p, chunk.content);
          if (sim >= 0.25) {
            matches.push({ sourceText: p, matchType: "local", matchedText: chunk.content.slice(0, 300), matchedFrom: chunk.file.name, similarity: sim, riskLevel: "high" });
            break;
          }
        }
      }
    }

    // === 2. AI 语义评估（核心） ===
    let aiAssessment = "";
    try {
      const aiRes = await callAI({
        provider: "deepseek",
        messages: [
          {
            role: "system",
            content: `你是一个学术查重专家。分析以下论文内容，输出JSON格式评估：
{
  "score": <0-100的数字，代表整体抄袭/套写风险>,
  "findings": [
    {
      "type": "formulaic" | "suspicious" | "suggestion",
      "detail": "<具体发现>"
    }
  ]
}
- formulaic: 检测到学术套话/模板化表述
- suspicious: 疑似未正确引用的表述
- suggestion: 改进建议
只输出JSON，不要其他文字。`
          },
          { role: "user", content: content.slice(0, 8000) },
        ],
        stream: false,
      });

      const raw = await aiRes.text();
      // DeepSeek 返回的是 {choices:[{message:{content:"...", role:"assistant"}},...]} 包装
      // 需要从 content 字段提取 AI 生成的 JSON
      try {
        const parsed = JSON.parse(raw);
        const content = parsed.choices?.[0]?.message?.content || "";
        aiAssessment = content;
      } catch {
        // 如果外层解析失败，尝试直接 regex 提取
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiAssessment = jsonMatch[0];
      }
    } catch {
      // AI 失败不影响已有结果
    }

    // 解析 AI 评估结果
    let aiScore = 0;
    let aiFindings: { type: string; detail: string }[] = [];
    try {
      if (aiAssessment) {
        const parsed = JSON.parse(aiAssessment);
        aiScore = typeof parsed.score === "number" ? parsed.score : 0;
        aiFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
      }
    } catch {}

    // 将 AI 发现加入匹配列表
    for (const f of aiFindings) {
      const sim = f.type === "suspicious" ? 0.4 : f.type === "formulaic" ? 0.2 : 0.1;
      matches.push({
        sourceText: `【AI 评估】${f.detail}`,
        matchType: "ai",
        matchedText: f.detail,
        matchedFrom: f.type === "suspicious" ? "疑似抄袭风险" : f.type === "formulaic" ? "学术套话检测" : "改进建议",
        similarity: sim,
        riskLevel: sim >= 0.3 ? "high" : sim >= 0.15 ? "medium" : "low",
      });
    }

    // 入库
    const check = await prisma.plagiarismCheck.create({
      data: { projectId: projectId ?? null, title, content, status: "completed", completedAt: new Date() },
    });

    const deduped = Array.from(new Map(matches.map(m => [m.sourceText, m])).values())
      .sort((a, b) => b.similarity - a.similarity);

    for (const m of deduped) {
      await prisma.plagiarismMatch.create({
        data: { checkId: check.id, sourceText: m.sourceText.slice(0, 500), sourceOffset: 0, matchType: m.matchType, matchedText: m.matchedText.slice(0, 500), matchedFrom: m.matchedFrom.slice(0, 200), similarity: Math.round(m.similarity * 100) / 100, riskLevel: m.riskLevel },
      });
    }

    const ngramMax = matches.filter(m => m.matchType !== "ai").length > 0
      ? Math.max(...matches.filter(m => m.matchType !== "ai").map(m => m.similarity)) : 0;
    const maxSim = Math.max(ngramMax, aiScore / 100);
    let or: "high" | "medium" | "low" = "low";
    if (maxSim > 0.3 || aiScore > 30) or = "high";
    else if (maxSim > 0.12 || aiScore > 15) or = "medium";

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

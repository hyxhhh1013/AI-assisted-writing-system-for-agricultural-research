import prisma from "@/lib/prisma";
import { extractNGrams, jaccardSimilarity } from "@/lib/similarity";

export interface CheckOptions {
  projectId?: string;
  title: string;
  content: string;
  webSearch?: boolean;
}

export interface CheckResult {
  checkId: string;
  totalMatches: number;
  maxSimilarity: number;
  overallRisk: "high" | "medium" | "low";
  matches: Array<{
    id: string;
    sourceText: string;
    sourceOffset: number;
    matchType: "self" | "cross" | "local" | "web" | "ai";
    matchedText: string;
    matchedFrom: string;
    matchedUrl?: string;
    similarity: number;
    riskLevel: "high" | "medium" | "low";
  }>;
}

// ====== 分段（降低阈值到 10 字） ======

function splitParagraphs(text: string): { text: string; offset: number }[] {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
  const rawParts = cleaned.split(/\n\s*\n|(?<=[。！？；])\s*/);
  const result: { text: string; offset: number }[] = [];
  let offset = 0;
  for (const part of rawParts) {
    const t = part.trim();
    if (t.length >= 10) {
      result.push({ text: t, offset });
    }
    offset += part.length;
  }
  return result;
}

// ====== 混合相似度 ======

function calcSimilarity(a: string, b: string): number {
  const cleanedA = a.replace(/\s+/g, "");
  const cleanedB = b.replace(/\s+/g, "");
  if (cleanedA.length < 5 || cleanedB.length < 5) return 0;

  const grams4A = extractNGrams(cleanedA, 4);
  const grams4B = extractNGrams(cleanedB, 4);
  const sim4 = jaccardSimilarity(grams4A, grams4B);

  const grams3A = extractNGrams(cleanedA, 3);
  const grams3B = extractNGrams(cleanedB, 3);
  const sim3 = jaccardSimilarity(grams3A, grams3B);

  return sim4 * 0.6 + sim3 * 0.4;
}

function riskLevel(sim: number): "high" | "medium" | "low" {
  if (sim >= 0.35) return "high";
  if (sim >= 0.15) return "medium";
  return "low";
}

// ====== 主入口 ======

export async function runPlagiarismCheck(options: CheckOptions): Promise<CheckResult> {
  const { projectId, title, content, webSearch = true } = options;


  const check = await prisma.plagiarismCheck.create({
    data: { projectId: projectId ?? null, title, content, status: "processing" },
  });

  try {
    const paragraphs = splitParagraphs(content);
    if (paragraphs.length === 0) {
      throw new Error("未能从内容中提取有效段落，请检查输入");
    }

    const [selfDup, crossMatch, kbMatch, webMatch] = await Promise.all([
      detectSelfDuplication(paragraphs),
      detectCrossProject(paragraphs, projectId),
      detectKnowledgeBase(paragraphs),
      webSearch ? detectWeb(paragraphs) : Promise.resolve([] as any[]),
    ]);

    // 合并去重：每个 offset 保留最佳匹配
    const bestByOffset = new Map<number, any>();
    for (const m of [...selfDup, ...crossMatch, ...kbMatch, ...webMatch]) {
      const existing = bestByOffset.get(m.sourceOffset);
      if (!existing || m.similarity > existing.similarity) {
        bestByOffset.set(m.sourceOffset, m);
      }
    }

    const allMatches = Array.from(bestByOffset.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 50);

    // 写入 DB
    const created = [];
    for (const m of allMatches) {
      const record = await prisma.plagiarismMatch.create({
        data: {
          checkId: check.id,
          sourceText: m.sourceText.slice(0, 500),
          sourceOffset: m.sourceOffset,
          matchType: m.matchType,
          matchedText: m.matchedText.slice(0, 500),
          matchedFrom: m.matchedFrom,
          matchedUrl: m.matchedUrl ?? null,
          similarity: Math.round(m.similarity * 100) / 100,
          riskLevel: m.riskLevel,
        },
      });
      created.push({ ...m, id: record.id });
    }

    await prisma.plagiarismCheck.update({
      where: { id: check.id },
      data: { status: "completed", completedAt: new Date() },
    });

    const maxSim = created.length ? Math.max(...created.map((m) => m.similarity)) : 0;

    return {
      checkId: check.id,
      totalMatches: created.length,
      maxSimilarity: maxSim,
      overallRisk: maxSim > 0.35 ? "high" : maxSim > 0.15 ? "medium" : "low",
      matches: created,
    };
  } catch (err) {
    await prisma.plagiarismCheck.update({ where: { id: check.id }, data: { status: "failed" } }).catch(() => {});
    throw err;
  }
}

// ====== 检测 1：自身段落重复 ======

async function detectSelfDuplication(paragraphs: { text: string; offset: number }[]): Promise<any[]> {
  const matches: any[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < Math.min(i + 15, paragraphs.length); j++) {
      const sim = calcSimilarity(paragraphs[i].text, paragraphs[j].text);
      if (sim >= 0.3) {
        matches.push({
          sourceText: paragraphs[i].text,
          sourceOffset: paragraphs[i].offset,
          matchType: "self",
          matchedText: paragraphs[j].text,
          matchedFrom: "本文内部重复",
          similarity: sim,
          riskLevel: riskLevel(sim),
        });
        break;
      }
    }
  }
  return matches;
}

// ====== 检测 2：跨项目比对 ======

async function detectCrossProject(
  paragraphs: { text: string; offset: number }[],
  excludeProjectId?: string
): Promise<any[]> {
  const otherSections = await prisma.section.findMany({
    where: excludeProjectId ? { projectId: { not: excludeProjectId } } : {},
    select: { content: true, project: { select: { title: true } } },
    take: 300,
  });
  if (otherSections.length === 0) return [];

  const matches: any[] = [];
  for (const para of paragraphs) {
    let bestSim = 0;
    let bestSec: typeof otherSections[0] | null = null;
    for (const sec of otherSections) {
      if (!sec.content || sec.content.length < 20) continue;
      const sim = calcSimilarity(para.text, sec.content.slice(0, 800));
      if (sim > bestSim) { bestSim = sim; bestSec = sec; }
    }
    if (bestSim >= 0.2 && bestSec) {
      matches.push({
        sourceText: para.text,
        sourceOffset: para.offset,
        matchType: "cross",
        matchedText: bestSec.content.slice(0, 300),
        matchedFrom: bestSec.project?.title || "历史项目",
        similarity: bestSim,
        riskLevel: riskLevel(bestSim),
      });
    }
  }
  return matches;
}

// ====== 检测 3：知识库比对 ======

async function detectKnowledgeBase(paragraphs: { text: string; offset: number }[]): Promise<any[]> {
  const chunks = await prisma.knowledgeChunk.findMany({
    select: { content: true, file: { select: { name: true } } },
    take: 300,
  });
  if (chunks.length === 0) return [];

  const matches: any[] = [];
  for (const para of paragraphs) {
    let bestSim = 0;
    let bestChunk: typeof chunks[0] | null = null;
    for (const chunk of chunks) {
      const sim = calcSimilarity(para.text, chunk.content);
      if (sim > bestSim) { bestSim = sim; bestChunk = chunk; }
    }
    if (bestSim >= 0.2 && bestChunk) {
      matches.push({
        sourceText: para.text,
        sourceOffset: para.offset,
        matchType: "local",
        matchedText: bestChunk.content.slice(0, 300),
        matchedFrom: bestChunk.file.name,
        similarity: bestSim,
        riskLevel: riskLevel(bestSim),
      });
    }
  }
  return matches;
}

// ====== 检测 4：联网搜索 ======

async function detectWeb(paragraphs: { text: string; offset: number }[]): Promise<any[]> {
  const candidates = paragraphs.slice(0, 5);
  const matches: any[] = [];
  for (const para of candidates) {
    try {
      const results = await Promise.race([
        searchWeb(para.text),
        new Promise<any[]>((_, reject) => setTimeout(() => reject("timeout"), 12000)),
      ]);
      for (const r of results) {
        if (!r.snippet) continue;
        const sim = calcSimilarity(para.text, r.snippet);
        if (sim >= 0.18) {
          matches.push({
            sourceText: para.text,
            sourceOffset: para.offset,
            matchType: "web",
            matchedText: r.snippet.slice(0, 300),
            matchedFrom: r.title,
            matchedUrl: r.url,
            similarity: sim,
            riskLevel: riskLevel(sim),
          });
          break;
        }
      }
    } catch {}
  }
  return matches;
}

async function searchWeb(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const q = query.replace(/[\s\n]+/g, " ").slice(0, 100);
  const results: { title: string; snippet: string; url: string }[] = [];

  // Semantic Scholar
  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=3&fields=title,url,abstract`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const p of data.data ?? []) {
        results.push({ title: p.title ?? "", snippet: p.abstract ?? p.title ?? "", url: p.url ?? "" });
      }
    }
  } catch {}

  // OpenAlex
  try {
    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=3&sort=relevance`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const work of data.results ?? []) {
        const snippet = work.abstract_inverted_index
          ? reconstructAbstract(work.abstract_inverted_index).slice(0, 300)
          : (work.title ?? "");
        results.push({ title: work.title ?? "", snippet, url: work.doi ? `https://doi.org/${work.doi}` : "" });
      }
    }
  } catch {}

  return results;
}

function reconstructAbstract(inverted: Record<string, number[]>): string {
  if (!inverted) return "";
  const words: { word: string; pos: number }[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) words.push({ word, pos });
  }
  words.sort((a, b) => a.pos - b.pos);
  return words.map((w) => w.word).join(" ");
}

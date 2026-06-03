/**
 * 统一查重 Service
 *
 * 合并 v1 service、v1 API、v2 API 三套实现为一个可配置的 service。
 * 通过 PlagiarismConfig 控制检测层级，通过 ProgressCallback 推送 SSE 进度。
 */

import prisma from "@/lib/prisma";
import { localRAG } from "@/lib/rag";
import { callAI } from "@/lib/ai";
import { extractNGrams, jaccardSimilarity, cosineSimilarity } from "@/lib/similarity";

// ==================== 类型 ====================

export interface PlagiarismConfig {
  /** 自引检测：段落间滑动窗口比对 */
  selfDuplication: boolean;
  /** 跨项目检测：与数据库中其他项目比对 */
  crossProject: boolean;
  /** 知识库检测：与 KnowledgeChunk 比对 */
  knowledgeBase: boolean;
  /** Embedding 语义检测：向量余弦相似度 */
  embeddingSemantic: boolean;
  /** 联网搜索：Semantic Scholar + OpenAlex */
  webSearch: boolean;
  /** 学术套话检测：正则模式匹配 */
  academicCliche: boolean;
  /** AI 语义评估：DeepSeek 结构化分析 */
  aiAssessment: boolean;
  thresholds: {
    self: number;
    cross: number;
    knowledge: number;
    embedding: number;
    web: number;
  };
  maxMatches: number;
  sampleThreshold: number;
  webSearchLimit: number;
  embeddingLimit: number;
}

export const DEFAULT_CONFIG: PlagiarismConfig = {
  selfDuplication: true,
  crossProject: true,
  knowledgeBase: true,
  embeddingSemantic: true,
  webSearch: false,      // 联网默认关闭，需用户勾选
  academicCliche: true,
  aiAssessment: true,
  thresholds: {
    self: 0.18,
    cross: 0.15,
    knowledge: 0.15,
    embedding: 0.7,
    web: 0.18,
  },
  maxMatches: 50,
  sampleThreshold: 60,
  webSearchLimit: 8,
  embeddingLimit: 10,
};

export interface CheckInput {
  projectId?: string;
  title: string;
  content: string;
  webSearch?: boolean;
  config?: Partial<PlagiarismConfig>;
}

export type ProgressStage =
  | "splitting"
  | "self_duplication"
  | "cross_project"
  | "knowledge_base"
  | "embedding_semantic"
  | "web_search"
  | "academic_cliche"
  | "ai_assessment"
  | "saving";

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface CheckResult {
  checkId: string;
  totalMatches: number;
  maxSimilarity: number;
  overallRisk: "high" | "medium" | "low";
  matches: PlagiarismMatchResult[];
  stats: {
    totalParagraphs: number;
    sampledParagraphs: number;
    selfMatches: number;
    crossMatches: number;
    knowledgeMatches: number;
    embeddingMatches: number;
    webMatches: number;
    clicheMatches: number;
    aiMatches: number;
    processingTime: number;
  };
}

export interface PlagiarismMatchResult {
  id: string;
  sourceText: string;
  sourceOffset: number;
  matchType: "self" | "cross" | "local" | "web" | "ai";
  matchedText: string;
  matchedFrom: string;
  matchedUrl?: string;
  similarity: number;
  riskLevel: "high" | "medium" | "low";
}

// ==================== 工具函数 ====================

/** 分段：按句号/分号/空行分割，过滤过短段落 */
function splitParagraphs(text: string): { text: string; offset: number }[] {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
  const rawParts = cleaned.split(/\n\s*\n|(?<=[。！？；])\s*/);
  const result: { text: string; offset: number }[] = [];
  let offset = 0;
  for (const part of rawParts) {
    const t = part.trim();
    if (t.length >= 8) {
      result.push({ text: t, offset });
    }
    offset += part.length;
  }
  return result;
}

/** 混合相似度：4-gram * 0.6 + 3-gram * 0.4 */
function calcSimilarity(a: string, b: string): number {
  const ca = a.replace(/\s+/g, "");
  const cb = b.replace(/\s+/g, "");
  if (ca.length < 5 || cb.length < 5) return 0;

  const sim4 = jaccardSimilarity(extractNGrams(ca, 4), extractNGrams(cb, 4));
  const sim3 = jaccardSimilarity(extractNGrams(ca, 3), extractNGrams(cb, 3));
  return sim4 * 0.6 + sim3 * 0.4;
}

/** 风险等级 */
function riskLevel(sim: number, highThreshold = 0.35, mediumThreshold = 0.12): "high" | "medium" | "low" {
  if (sim >= highThreshold) return "high";
  if (sim >= mediumThreshold) return "medium";
  return "low";
}

/** 长文本采样 */
function sampleParagraphs(
  paragraphs: { text: string; offset: number }[],
  maxSamples: number
): { text: string; offset: number }[] {
  if (paragraphs.length <= maxSamples) return paragraphs;
  const step = Math.floor(paragraphs.length / maxSamples);
  const sampled: { text: string; offset: number }[] = [];
  for (let i = 0; i < paragraphs.length; i += step) {
    sampled.push(paragraphs[i]);
    if (sampled.length >= maxSamples) break;
  }
  return sampled;
}

/** 学术套话检测 */
const FORMULAIC_PATTERNS = [
  /随着[^。]{5,50}的发展/g,
  /近年来[^。]{3,60}/g,
  /得到了[^。]{3,50}的[关注|重视|应用]/g,
  /具有[^。]{3,40}的[意义|价值|作用]/g,
  /为[^。]{5,60}提供[了]?[^。]{3,40}/g,
  /国内外[^。]{5,80}/g,
  /综上所述[^。]{5,60}/g,
  /[研究|实验|实践]表明[^。]{5,60}/g,
  /是一种[^。]{3,50}的[方法|技术|途径]/g,
  /有效地[^。]{3,50}/g,
  /可以[有效|显著|明显][^。]{3,50}/g,
  /在[^。]{3,30}中起[着]?[^。]{3,30}作用/g,
  /目前[^。]{5,80}/g,
  /越来越[^。]{5,60}/g,
  /不可忽视[^。]{5,60}/g,
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

/** OpenAlex 重建摘要 */
function reconstructAbstract(inverted: Record<string, number[]>): string {
  if (!inverted) return "";
  const words: { word: string; pos: number }[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) words.push({ word, pos });
  }
  words.sort((a, b) => a.pos - b.pos);
  return words.map((w) => w.word).join(" ");
}

// ==================== 检测器 ====================

/** 检测 1：自身段落重复 */
async function detectSelfDuplication(
  paragraphs: { text: string; offset: number }[],
  threshold: number
): Promise<PlagiarismMatchResult[]> {
  const matches: PlagiarismMatchResult[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < Math.min(i + 15, paragraphs.length); j++) {
      const sim = calcSimilarity(paragraphs[i].text, paragraphs[j].text);
      if (sim >= threshold) {
        matches.push({
          id: "",
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

/** 检测 2：跨项目比对 */
async function detectCrossProject(
  paragraphs: { text: string; offset: number }[],
  excludeProjectId: string | undefined,
  threshold: number
): Promise<PlagiarismMatchResult[]> {
  const otherSections = await prisma.section.findMany({
    where: excludeProjectId ? { projectId: { not: excludeProjectId } } : {},
    select: { content: true, project: { select: { title: true } } },
    take: 300,
  });
  if (otherSections.length === 0) return [];

  const matches: PlagiarismMatchResult[] = [];
  for (const para of paragraphs) {
    let bestSim = 0;
    let bestSec: (typeof otherSections)[0] | null = null;
    for (const sec of otherSections) {
      if (!sec.content || sec.content.length < 20) continue;
      const sim = calcSimilarity(para.text, sec.content.slice(0, 800));
      if (sim > bestSim) {
        bestSim = sim;
        bestSec = sec;
      }
    }
    if (bestSim >= threshold && bestSec) {
      matches.push({
        id: "",
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

/** 检测 3：知识库比对 */
async function detectKnowledgeBase(
  paragraphs: { text: string; offset: number }[],
  threshold: number
): Promise<PlagiarismMatchResult[]> {
  const chunks = await prisma.knowledgeChunk.findMany({
    select: { content: true, file: { select: { name: true } } },
    take: 300,
  });
  if (chunks.length === 0) return [];

  const matches: PlagiarismMatchResult[] = [];
  for (const para of paragraphs) {
    let bestSim = 0;
    let bestChunk: (typeof chunks)[0] | null = null;
    for (const chunk of chunks) {
      const sim = calcSimilarity(para.text, chunk.content);
      if (sim > bestSim) {
        bestSim = sim;
        bestChunk = chunk;
      }
    }
    if (bestSim >= threshold && bestChunk) {
      matches.push({
        id: "",
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

/** 检测 4：Embedding 语义比对 */
async function detectEmbeddingSemantic(
  paragraphs: { text: string; offset: number }[],
  chunks: { content: string }[],
  threshold: number,
  limit: number
): Promise<PlagiarismMatchResult[]> {
  const matches: PlagiarismMatchResult[] = [];
  const candidates = paragraphs.slice(0, limit);
  if (candidates.length === 0 || chunks.length === 0) return matches;

  // 预计算 chunk embeddings（避免重复计算）
  const chunkEmbeddings: { content: string; embedding: number[] }[] = [];
  for (const chunk of chunks.slice(0, 200)) {
    try {
      const embedding = await localRAG.getEmbedding(chunk.content.slice(0, 300));
      if (embedding && embedding.length > 0) {
        chunkEmbeddings.push({ content: chunk.content, embedding });
      }
    } catch {
      // embedding 失败跳过该 chunk
    }
  }

  for (const para of candidates) {
    try {
      const pEmbed = await localRAG.getEmbedding(para.text);
      if (!pEmbed || pEmbed.length === 0) continue;

      let bestSim = 0;
      let bestChunk = "";
      for (const ce of chunkEmbeddings) {
        const sim = cosineSimilarity(pEmbed, ce.embedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestChunk = ce.content.slice(0, 300);
        }
      }

      if (bestSim > threshold) {
        matches.push({
          id: "",
          sourceText: para.text,
          sourceOffset: para.offset,
          matchType: "local",
          matchedText: bestChunk,
          matchedFrom: "语义相似",
          similarity: bestSim * 0.5, // 降权
          riskLevel: riskLevel(bestSim * 0.5),
        });
      }
    } catch {
      // 单段 embedding 失败不影响整体
    }
  }
  return matches;
}

/** 检测 5：联网搜索 */
async function detectWebSearch(
  paragraphs: { text: string; offset: number }[],
  threshold: number,
  limit: number
): Promise<PlagiarismMatchResult[]> {
  const candidates = paragraphs.slice(0, limit);
  const matches: PlagiarismMatchResult[] = [];

  for (const para of candidates) {
    try {
      const results = await Promise.race([
        searchAcademic(para.text),
        new Promise<{ title: string; snippet: string; url: string }[]>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 12000)
        ),
      ]);
      for (const r of results) {
        if (!r.snippet) continue;
        const sim = calcSimilarity(para.text, r.snippet);
        if (sim >= threshold) {
          matches.push({
            id: "",
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
    } catch {
      // 单段搜索失败不影响整体
    }
  }
  return matches;
}

async function searchAcademic(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const q = query.replace(/[\s\n]+/g, " ").slice(0, 100);
  const results: { title: string; snippet: string; url: string }[] = [];

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

/** 检测 6：学术套话检测 */
function detectAcademicCliche(
  content: string,
  paragraphs: { text: string; offset: number }[]
): { formulaic: { pattern: string; count: number }[]; shortRatio: number; matches: PlagiarismMatchResult[] } {
  const formulaic = detectFormulaic(content);

  // 短句式占比
  const highFreqLen = paragraphs
    .filter((p) => p.text.length >= 15 && p.text.length <= 60)
    .reduce((s, p) => s + p.text.length, 0);
  const totalLen = paragraphs.reduce((s, p) => s + p.text.length, 0);
  const shortRatio = totalLen > 0 ? highFreqLen / totalLen : 0;

  const matches: PlagiarismMatchResult[] = [];

  if (formulaic.length >= 2) {
    const patternTexts = formulaic.map((f) => f.pattern).join("、");
    matches.push({
      id: "",
      sourceText: `【学术套话】检测到 ${formulaic.length} 类常见学术套话模式（${formulaic.reduce((s, f) => s + f.count, 0)} 处）`,
      sourceOffset: 0,
      matchType: "ai",
      matchedText: formulaic.map((f) => `"${f.pattern}" 出现 ${f.count} 次`).join("；"),
      matchedFrom: `套话分析：${patternTexts}`,
      similarity: 0.15,
      riskLevel: "medium",
    });
  }

  if (shortRatio > 0.4 && paragraphs.length > 30) {
    matches.push({
      id: "",
      sourceText: `【写作风格】短句式占比 ${(shortRatio * 100).toFixed(0)}%，建议增补具体研究细节`,
      sourceOffset: 0,
      matchType: "ai",
      matchedText: "建议增加具体实验参数、数据指标等个性化内容，减少通用句式",
      matchedFrom: "写作风格分析",
      similarity: 0.12,
      riskLevel: "low",
    });
  }

  return { formulaic, shortRatio, matches };
}

/** 检测 7：AI 语义评估 */
async function detectAiAssessment(content: string): Promise<{
  score: number;
  findings: { type: string; detail: string }[];
  matches: PlagiarismMatchResult[];
}> {
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
只输出JSON，不要其他文字。`,
        },
        { role: "user", content: content.slice(0, 8000) },
      ],
      stream: false,
    });

    const raw = await aiRes.text();
    let parsed: { score?: number; findings?: { type: string; detail: string }[] } = {};

    // 三层容错解析
    try {
      const outer = JSON.parse(raw);
      const inner = outer.choices?.[0]?.message?.content || "";
      if (inner) {
        parsed = JSON.parse(inner);
      } else {
        parsed = outer;
      }
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch {}
      }
    }

    const score = typeof parsed.score === "number" ? parsed.score : 0;
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    const matches: PlagiarismMatchResult[] = findings.map((f) => {
      const sim = f.type === "suspicious" ? 0.4 : f.type === "formulaic" ? 0.2 : 0.1;
      return {
        id: "",
        sourceText: `【AI 评估】${f.detail}`,
        sourceOffset: 0,
        matchType: "ai" as const,
        matchedText: f.detail,
        matchedFrom: f.type === "suspicious" ? "疑似抄袭风险" : f.type === "formulaic" ? "学术套话检测" : "改进建议",
        similarity: sim,
        riskLevel: riskLevel(sim),
      };
    });

    return { score, findings, matches };
  } catch {
    return { score: 0, findings: [], matches: [] };
  }
}

// ==================== 主入口 ====================

export async function runPlagiarismCheck(
  input: CheckInput,
  onProgress?: ProgressCallback
): Promise<CheckResult> {
  const startTime = Date.now();
  const config: PlagiarismConfig = { ...DEFAULT_CONFIG, ...input.config };
  if (input.webSearch !== undefined) config.webSearch = input.webSearch;

  const progress = (stage: ProgressStage, message: string) => {
    onProgress?.({ stage, message });
  };

  // 1. 创建 DB 记录
  progress("splitting", "正在分析文本结构...");
  const check = await prisma.plagiarismCheck.create({
    data: {
      projectId: input.projectId ?? null,
      title: input.title,
      content: input.content,
      status: "processing",
    },
  });

  try {
    // 2. 分段
    const allParagraphs = splitParagraphs(input.content);
    if (allParagraphs.length === 0) {
      throw new Error("未能从内容中提取有效段落，请检查输入");
    }

    // 3. 长文本采样
    const paragraphs = sampleParagraphs(allParagraphs, config.sampleThreshold);

    // 4. 并行执行本地检测
    const localTasks: Promise<PlagiarismMatchResult[]>[] = [];
    const usedTexts = new Set<string>();

    if (config.selfDuplication) {
      progress("self_duplication", "正在检测自引重复...");
      localTasks.push(
        detectSelfDuplication(paragraphs, config.thresholds.self).then((matches) => {
          for (const m of matches) usedTexts.add(m.sourceText);
          return matches;
        })
      );
    }

    if (config.crossProject) {
      progress("cross_project", "正在跨项目比对...");
      localTasks.push(
        detectCrossProject(paragraphs, input.projectId, config.thresholds.cross)
      );
    }

    if (config.knowledgeBase) {
      progress("knowledge_base", "正在知识库比对...");
      localTasks.push(detectKnowledgeBase(paragraphs, config.thresholds.knowledge));
    }

    const localResults = await Promise.all(localTasks);
    const allLocalMatches = localResults.flat();

    // 标记已匹配的段落
    for (const m of allLocalMatches) usedTexts.add(m.sourceText);

    // 5. Embedding 语义检测
    let embeddingMatches: PlagiarismMatchResult[] = [];
    if (config.embeddingSemantic) {
      progress("embedding_semantic", "正在语义分析...");
      try {
        const chunks = await prisma.knowledgeChunk.findMany({
          select: { content: true },
          take: 200,
        });
        const unmatched = paragraphs.filter((p) => !usedTexts.has(p.text));
        embeddingMatches = await detectEmbeddingSemantic(
          unmatched,
          chunks,
          config.thresholds.embedding,
          config.embeddingLimit
        );
      } catch {
        // embedding 失败不影响结果
      }
    }

    // 6. 联网搜索
    let webMatches: PlagiarismMatchResult[] = [];
    if (config.webSearch) {
      progress("web_search", "正在联网搜索...");
      webMatches = await detectWebSearch(paragraphs, config.thresholds.web, config.webSearchLimit);
    }

    // 7. 学术套话检测
    let clicheMatches: PlagiarismMatchResult[] = [];
    if (config.academicCliche) {
      progress("academic_cliche", "正在学术套话检测...");
      const clicheResult = detectAcademicCliche(input.content, paragraphs);
      clicheMatches = clicheResult.matches;
    }

    // 8. AI 语义评估
    let aiResult = { score: 0, findings: [] as { type: string; detail: string }[], matches: [] as PlagiarismMatchResult[] };
    if (config.aiAssessment) {
      progress("ai_assessment", "正在 AI 语义评估...");
      aiResult = await detectAiAssessment(input.content);
    }

    // 9. 合并去重
    progress("saving", "正在保存结果...");
    const allMatches = [
      ...allLocalMatches,
      ...embeddingMatches,
      ...webMatches,
      ...clicheMatches,
      ...aiResult.matches,
    ];

    // 按 sourceText 去重，保留最佳匹配
    const bestBySource = new Map<string, PlagiarismMatchResult>();
    for (const m of allMatches) {
      const key = m.sourceText.slice(0, 100);
      const existing = bestBySource.get(key);
      if (!existing || m.similarity > existing.similarity) {
        bestBySource.set(key, m);
      }
    }

    const deduped = Array.from(bestBySource.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, config.maxMatches);

    // 10. 批量写入 DB
    if (deduped.length > 0) {
      await prisma.plagiarismMatch.createMany({
        data: deduped.map((m) => ({
          checkId: check.id,
          sourceText: m.sourceText.slice(0, 500),
          sourceOffset: m.sourceOffset,
          matchType: m.matchType,
          matchedText: m.matchedText.slice(0, 500),
          matchedFrom: m.matchedFrom.slice(0, 200),
          matchedUrl: m.matchedUrl ?? null,
          similarity: Math.round(m.similarity * 100) / 100,
          riskLevel: m.riskLevel,
        })),
      });
    }

    // 11. 计算汇总
    const maxSim = deduped.length ? Math.max(...deduped.map((m) => m.similarity)) : 0;
    let overallRisk: "high" | "medium" | "low" = "low";
    if (maxSim > 0.35 || aiResult.score > 30) overallRisk = "high";
    else if (maxSim > 0.12 || aiResult.score > 15 || deduped.length >= 5) overallRisk = "medium";

    // 12. 更新 DB
    await prisma.plagiarismCheck.update({
      where: { id: check.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        maxSimilarity: maxSim,
        overallRisk,
      },
    });

    // 13. 构造带 ID 的结果
    const dbMatches = await prisma.plagiarismMatch.findMany({
      where: { checkId: check.id },
      orderBy: { similarity: "desc" },
    });

    return {
      checkId: check.id,
      totalMatches: dbMatches.length,
      maxSimilarity: maxSim,
      overallRisk,
      matches: dbMatches.map((m) => ({
        id: m.id,
        sourceText: m.sourceText,
        sourceOffset: m.sourceOffset,
        matchType: m.matchType as PlagiarismMatchResult["matchType"],
        matchedText: m.matchedText,
        matchedFrom: m.matchedFrom,
        matchedUrl: m.matchedUrl ?? undefined,
        similarity: m.similarity,
        riskLevel: m.riskLevel as PlagiarismMatchResult["riskLevel"],
      })),
      stats: {
        totalParagraphs: allParagraphs.length,
        sampledParagraphs: paragraphs.length,
        selfMatches: allLocalMatches.filter((m) => m.matchType === "self").length,
        crossMatches: allLocalMatches.filter((m) => m.matchType === "cross").length,
        knowledgeMatches: allLocalMatches.filter((m) => m.matchType === "local").length,
        embeddingMatches: embeddingMatches.length,
        webMatches: webMatches.length,
        clicheMatches: clicheMatches.length,
        aiMatches: aiResult.matches.length,
        processingTime: Date.now() - startTime,
      },
    };
  } catch (err) {
    await prisma.plagiarismCheck
      .update({ where: { id: check.id }, data: { status: "failed" } })
      .catch(() => {});
    throw err;
  }
}

/**
 * 统一查重 Service
 *
 * 合并 v1 service、v1 API、v2 API 三套实现为一个可配置的 service。
 * 通过 PlagiarismConfig 控制检测层级，通过 ProgressCallback 推送 SSE 进度。
 */

import prisma from "@/lib/prisma";
import { localRAG, type RagChunk } from "@/lib/rag";
import { callAI } from "@/lib/ai";
import {
  buildPassageIndex,
  containmentSimilarity,
  topPassages,
  type IndexedPassage,
} from "@/lib/text-fingerprint";
import {
  dedupeByOffsetAndType,
  isSkippedParagraph,
  isSkippedSectionTitle,
  labelCorpusSource,
  locateParagraphs,
  overlapCoverage,
  riskFromContainment,
  riskFromOverlap,
  splitParagraphs,
  type CheckedParagraph,
  type CoverageSection,
} from "@/lib/plagiarism-coverage";

// ==================== 类型 ====================

export interface PlagiarismConfig {
  /** 自引检测：段落间滑动窗口比对 */
  selfDuplication: boolean;
  /** 跨项目检测：与数据库中其他项目比对 */
  crossProject: boolean;
  /** 知识库检测：与 KnowledgeChunk 比对 */
  knowledgeBase: boolean;
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
    web: number;
  };
  maxMatches: number;
  webSearchLimit: number;
}

export const DEFAULT_CONFIG: PlagiarismConfig = {
  selfDuplication: true,
  crossProject: true,
  knowledgeBase: true,
  webSearch: false,      // 联网默认关闭，需用户勾选
  academicCliche: true,
  aiAssessment: true,
  thresholds: {
    self: 0.3,
    cross: 0.3,
    knowledge: 0.3,
    web: 0.3,
  },
  maxMatches: 50,
  webSearchLimit: 8,
};

export interface CheckInput {
  projectId?: string;
  userId?: string;
  title: string;
  content: string;
  webSearch?: boolean;
  /** 只跑自引 / 知识库 / 跨项目，供降重后复检 */
  literalOnly?: boolean;
  sections?: CoverageSection[];
  referenceTitles?: string[];
  /** 进度文案，例如章节名 */
  recheckLabel?: string;
  config?: Partial<PlagiarismConfig>;
}

export type ProgressStage =
  | "splitting"
  | "self_duplication"
  | "cross_project"
  | "knowledge_base"
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
  /** 与 overlapCoverage 相同，兼容旧客户端 */
  maxSimilarity: number;
  overlapCoverage: number;
  aiStatus: "ok" | "failed" | "skipped";
  overallRisk: "high" | "medium" | "low";
  warnings?: string[];
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
  sourceLength: number;
  matchType: "self" | "cross" | "local" | "web" | "ai";
  matchedText: string;
  matchedFrom: string;
  matchedUrl?: string;
  similarity: number;
  riskLevel: "high" | "medium" | "low";
}

// ==================== 工具函数 ====================

function blankMatch(partial: Omit<PlagiarismMatchResult, "id" | "sourceLength"> & { sourceLength?: number }): PlagiarismMatchResult {
  return {
    id: "",
    sourceLength: partial.sourceLength ?? partial.sourceText.length,
    ...partial,
  };
}

/** 学术套话检测 */
const FORMULAIC_PATTERNS = [
  /随着[^。]{5,50}的发展/g,
  /近年来[^。]{3,60}/g,
  /得到了[^。]{3,50}的(关注|重视|应用)/g,
  /具有[^。]{3,40}的(意义|价值|作用)/g,
  /为[^。]{5,60}提供了?[^。]{3,40}/g,
  /国内外[^。]{5,80}/g,
  /综上所述[^。]{5,60}/g,
  /(研究|实验|实践)表明[^。]{5,60}/g,
  /是一种[^。]{3,50}的(方法|技术|途径)/g,
  /有效地[^。]{3,50}/g,
  /可以(有效|显著|明显)[^。]{3,50}/g,
  /在[^。]{3,30}中起着?[^。]{3,30}作用/g,
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

function eligibleParagraphs(paragraphs: CheckedParagraph[]): CheckedParagraph[] {
  return paragraphs.filter((paragraph) => !isSkippedParagraph(paragraph.text));
}

/** 检测 1：自身段落重复（后 15 段，包含率） */
function detectSelfDuplication(
  paragraphs: CheckedParagraph[],
  threshold: number,
): PlagiarismMatchResult[] {
  const eligible = eligibleParagraphs(paragraphs);
  const matches: PlagiarismMatchResult[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < Math.min(i + 15, eligible.length); j++) {
      const sim = Math.max(
        containmentSimilarity(eligible[i].text, eligible[j].text),
        containmentSimilarity(eligible[j].text, eligible[i].text),
      );
      if (sim >= threshold) {
        matches.push(blankMatch({
          sourceText: eligible[i].text,
          sourceOffset: eligible[i].offset,
          sourceLength: eligible[i].text.length,
          matchType: "self",
          matchedText: eligible[j].text,
          matchedFrom: "本文内部重复",
          similarity: sim,
          riskLevel: riskFromContainment(sim),
        }));
        break;
      }
    }
  }
  return matches;
}

const CROSS_SECTION_CAP = 500;
const CROSS_PASSAGE_CAP = 400;

/** 检测 2：跨项目。拆段后做 n-gram 倒排，再算包含率。 */
async function detectCrossProject(
  paragraphs: CheckedParagraph[],
  excludeProjectId: string | undefined,
  userId: string | undefined,
  threshold: number,
): Promise<PlagiarismMatchResult[]> {
  if (!userId) return [];
  const otherSections = await prisma.section.findMany({
    where: {
      project: { userId },
      ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
    },
    select: { content: true, project: { select: { title: true } } },
    orderBy: [{ projectId: "asc" }, { key: "asc" }],
    take: CROSS_SECTION_CAP,
  });
  const passages: IndexedPassage[] = [];
  for (const section of otherSections) {
    if (!section.content) continue;
    for (const paragraph of splitParagraphs(section.content)) {
      if (isSkippedParagraph(paragraph.text)) continue;
      passages.push({
        text: paragraph.text,
        from: section.project?.title || "历史项目",
      });
      if (passages.length >= CROSS_PASSAGE_CAP) break;
    }
    if (passages.length >= CROSS_PASSAGE_CAP) break;
  }
  if (passages.length === 0) return [];

  const index = buildPassageIndex(passages);
  const matches: PlagiarismMatchResult[] = [];
  for (const paragraph of eligibleParagraphs(paragraphs)) {
    let bestSim = 0;
    let best: IndexedPassage | null = null;
    for (const candidate of topPassages(index, paragraph.text, 8)) {
      const sim = containmentSimilarity(paragraph.text, candidate.text);
      if (sim > bestSim) {
        bestSim = sim;
        best = candidate;
      }
    }
    if (bestSim >= threshold && best) {
      matches.push(blankMatch({
        sourceText: paragraph.text,
        sourceOffset: paragraph.offset,
        sourceLength: paragraph.text.length,
        matchType: "cross",
        matchedText: best.text.slice(0, 300),
        matchedFrom: best.from,
        similarity: bestSim,
        riskLevel: riskFromContainment(bestSim),
      }));
    }
  }
  return matches;
}

/** 检测 3：按章检索已有 RAG 索引，再对章内段落做包含率对齐。 */
async function detectKnowledgeBase(
  sections: CoverageSection[],
  paragraphs: CheckedParagraph[],
  threshold: number,
  referenceTitles: string[],
  onChapter?: (title: string) => void,
): Promise<PlagiarismMatchResult[]> {
  const matches: PlagiarismMatchResult[] = [];
  for (const section of sections) {
    if (isSkippedSectionTitle(section.title)) continue;
    const chapterParagraphs = eligibleParagraphs(
      paragraphs.filter((paragraph) => paragraph.sectionKey === section.key),
    );
    if (chapterParagraphs.length === 0) continue;
    onChapter?.(section.title);
    const query = chapterParagraphs.slice(0, 3).map((paragraph) => paragraph.text).join(" ").slice(0, 500);
    let hits: RagChunk[] = [];
    try {
      hits = await localRAG.search(query, { limit: 8, multiQuery: false });
    } catch {
      continue;
    }
    for (const paragraph of chapterParagraphs) {
      let bestSim = 0;
      let bestHit: RagChunk | null = null;
      for (const hit of hits) {
        if (!hit.content) continue;
        const sim = containmentSimilarity(paragraph.text, hit.content);
        if (sim > bestSim) {
          bestSim = sim;
          bestHit = hit;
        }
      }
      if (bestSim >= threshold && bestHit) {
        const source = bestHit.metadata.source || "知识库";
        matches.push(blankMatch({
          sourceText: paragraph.text,
          sourceOffset: paragraph.offset,
          sourceLength: paragraph.text.length,
          matchType: "local",
          matchedText: bestHit.content.slice(0, 300),
          matchedFrom: labelCorpusSource(source, referenceTitles),
          similarity: bestSim,
          riskLevel: riskFromContainment(bestSim),
        }));
      }
    }
  }
  return matches;
}

/** 检测 5：联网搜索。全部失败时由主流程写入 warnings，避免静默变成 0 命中。 */
async function detectWebSearch(
  paragraphs: CheckedParagraph[],
  threshold: number,
  limit: number,
): Promise<{ matches: PlagiarismMatchResult[]; attempts: number; failures: number }> {
  const candidates = eligibleParagraphs(paragraphs).slice(0, limit);
  const matches: PlagiarismMatchResult[] = [];
  let failures = 0;

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
        const sim = containmentSimilarity(para.text, r.snippet);
        if (sim >= threshold) {
          matches.push(blankMatch({
            sourceText: para.text,
            sourceOffset: para.offset,
            sourceLength: para.text.length,
            matchType: "web",
            matchedText: r.snippet.slice(0, 300),
            matchedFrom: r.title,
            matchedUrl: r.url,
            similarity: sim,
            riskLevel: riskFromContainment(sim),
          }));
          break;
        }
      }
    } catch {
      failures += 1;
    }
  }
  return { matches, attempts: candidates.length, failures };
}

async function searchAcademic(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const q = query.replace(/[\s\n]+/g, " ").slice(0, 100);
  const results: { title: string; snippet: string; url: string }[] = [];
  let scholarOk = false;
  let openAlexOk = false;

  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=3&fields=title,url,abstract`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      scholarOk = true;
      const data = await res.json();
      for (const p of data.data ?? []) {
        results.push({ title: p.title ?? "", snippet: p.abstract ?? p.title ?? "", url: p.url ?? "" });
      }
    }
  } catch {
    scholarOk = false;
  }

  try {
    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=3&sort=relevance`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      openAlexOk = true;
      const data = await res.json();
      for (const work of data.results ?? []) {
        const snippet = work.abstract_inverted_index
          ? reconstructAbstract(work.abstract_inverted_index).slice(0, 300)
          : (work.title ?? "");
        results.push({ title: work.title ?? "", snippet, url: work.doi ? `https://doi.org/${work.doi}` : "" });
      }
    }
  } catch {
    openAlexOk = false;
  }

  if (!scholarOk && !openAlexOk) {
    throw new Error("academic search failed");
  }
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
    matches.push(blankMatch({
      sourceText: `【学术套话】检测到 ${formulaic.length} 类常见学术套话模式（${formulaic.reduce((s, f) => s + f.count, 0)} 处）`,
      sourceOffset: 0,
      sourceLength: 0,
      matchType: "ai",
      matchedText: formulaic.map((f) => `"${f.pattern}" 出现 ${f.count} 次`).join("；"),
      matchedFrom: `套话分析：${patternTexts}`,
      similarity: 0,
      riskLevel: "low",
    }));
  }

  if (shortRatio > 0.4 && paragraphs.length > 30) {
    matches.push(blankMatch({
      sourceText: `【写作风格】短句式占比 ${(shortRatio * 100).toFixed(0)}%，建议增补具体研究细节`,
      sourceOffset: 0,
      sourceLength: 0,
      matchType: "ai",
      matchedText: "建议增加具体实验参数、数据指标等个性化内容，减少通用句式",
      matchedFrom: "写作风格分析",
      similarity: 0,
      riskLevel: "low",
    }));
  }

  return { formulaic, shortRatio, matches };
}

/** 检测 7：AI 语义评估 */
async function detectAiAssessment(
  content: string,
  signal?: AbortSignal,
): Promise<{
  status: "ok" | "failed";
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
      signal,
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

    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    const matches: PlagiarismMatchResult[] = findings.map((f) => blankMatch({
      sourceText: `【AI 评估】${f.detail}`,
      sourceOffset: 0,
      sourceLength: 0,
      matchType: "ai" as const,
      matchedText: f.detail,
      matchedFrom: f.type === "suspicious" ? "疑似抄袭风险" : f.type === "formulaic" ? "学术套话检测" : "改进建议",
      similarity: 0,
      riskLevel: "low",
    }));

    return { status: "ok", matches };
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
    return { status: "failed", matches: [] };
  }
}

// ==================== 主入口 ====================

export async function runPlagiarismCheck(
  input: CheckInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CheckResult> {
  const startTime = Date.now();
  const config: PlagiarismConfig = { ...DEFAULT_CONFIG, ...input.config };
  if (input.webSearch !== undefined) config.webSearch = input.webSearch;
  if (input.literalOnly) {
    config.webSearch = false;
    config.academicCliche = false;
    config.aiAssessment = false;
  }

  const progress = (stage: ProgressStage, message: string) => {
    onProgress?.({ stage, message });
  };

  const sections: CoverageSection[] = input.sections?.filter((section) => section.content.trim()) ?? [];
  const document = locateParagraphs(
    sections.length > 0
      ? sections
      : [{ key: "body", title: input.title || "正文", content: input.content }],
  );
  if (document.paragraphs.length === 0) {
    throw new Error("未能从内容中提取有效段落，请检查输入");
  }

  const opening = input.recheckLabel
    ? `正在复检「${input.recheckLabel}」`
    : "正在分析文本结构...";
  progress("splitting", opening);

  const check = await prisma.plagiarismCheck.create({
    data: {
      projectId: input.projectId ?? null,
      title: input.title,
      content: document.canonical,
      status: "processing",
    },
  });

  try {
    const paragraphs = document.paragraphs;
    const eligibleCount = eligibleParagraphs(paragraphs).length;

    let selfMatches: PlagiarismMatchResult[] = [];
    if (config.selfDuplication) {
      progress("self_duplication", input.recheckLabel ? `正在复检「${input.recheckLabel}」的文内重复` : "正在检测自引重复...");
      selfMatches = detectSelfDuplication(paragraphs, config.thresholds.self);
    }

    let crossMatches: PlagiarismMatchResult[] = [];
    if (config.crossProject) {
      progress("cross_project", "正在跨项目比对...");
      crossMatches = await detectCrossProject(paragraphs, input.projectId, input.userId, config.thresholds.cross);
    }

    let knowledgeMatches: PlagiarismMatchResult[] = [];
    if (config.knowledgeBase) {
      const chapterSections = sections.length > 0
        ? sections
        : [{ key: "body", title: input.title || "正文", content: input.content }];
      knowledgeMatches = await detectKnowledgeBase(
        chapterSections,
        paragraphs,
        config.thresholds.knowledge,
        input.referenceTitles ?? [],
        (title) => {
          progress(
            "knowledge_base",
            input.recheckLabel
              ? `正在复检「${input.recheckLabel}」的文献重合`
              : `正在比对文献库（${title}）...`,
          );
        },
      );
    }

    const warnings: string[] = [];
    let webMatches: PlagiarismMatchResult[] = [];
    if (config.webSearch) {
      progress("web_search", "正在联网搜索...");
      const web = await detectWebSearch(paragraphs, config.thresholds.web, config.webSearchLimit);
      webMatches = web.matches;
      if (web.attempts > 0 && web.failures === web.attempts) {
        warnings.push("联网搜索失败，本次没有外部文献命中");
        progress("web_search", warnings[0]);
      }
    }

    let clicheMatches: PlagiarismMatchResult[] = [];
    if (config.academicCliche) {
      progress("academic_cliche", "正在学术套话检测...");
      clicheMatches = detectAcademicCliche(document.canonical, paragraphs).matches;
    }

    let aiStatus: CheckResult["aiStatus"] = input.literalOnly ? "skipped" : "skipped";
    let aiMatches: PlagiarismMatchResult[] = [];
    if (config.aiAssessment) {
      progress("ai_assessment", "正在 AI 语义评估...");
      const aiResult = await detectAiAssessment(document.canonical, signal);
      aiStatus = aiResult.status;
      aiMatches = aiResult.matches;
    }

    progress("saving", "正在保存结果...");
    const textMatches = dedupeByOffsetAndType([
      ...selfMatches,
      ...crossMatches,
      ...knowledgeMatches,
      ...webMatches,
    ])
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, config.maxMatches);
    const styleMatches = dedupeByOffsetAndType([...clicheMatches, ...aiMatches]);
    const deduped = [...textMatches, ...styleMatches];

    if (deduped.length > 0) {
      await prisma.plagiarismMatch.createMany({
        data: deduped.map((m) => ({
          checkId: check.id,
          sourceText: m.sourceText.slice(0, 500),
          sourceOffset: m.sourceOffset,
          sourceLength: m.sourceLength,
          matchType: m.matchType,
          matchedText: m.matchedText.slice(0, 500),
          matchedFrom: m.matchedFrom.slice(0, 200),
          matchedUrl: m.matchedUrl ?? null,
          similarity: Math.round(m.similarity * 100) / 100,
          riskLevel: m.riskLevel,
        })),
      });
    }

    const coverage = Math.round(
      overlapCoverage(
        textMatches.map((match) => ({
          offset: match.sourceOffset,
          length: match.sourceLength,
          matchType: match.matchType,
        })),
        document.eligibleChars,
      ) * 10000,
    ) / 10000;
    const overallRisk = riskFromOverlap(coverage);

    await prisma.plagiarismCheck.update({
      where: { id: check.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        maxSimilarity: coverage,
        overlapCoverage: coverage,
        aiStatus,
        overallRisk,
      },
    });

    const dbMatches = await prisma.plagiarismMatch.findMany({
      where: { checkId: check.id },
      orderBy: { similarity: "desc" },
    });

    return {
      checkId: check.id,
      totalMatches: dbMatches.length,
      maxSimilarity: coverage,
      overlapCoverage: coverage,
      aiStatus,
      overallRisk,
      warnings: warnings.length > 0 ? warnings : undefined,
      matches: dbMatches.map((m) => ({
        id: m.id,
        sourceText: m.sourceText,
        sourceOffset: m.sourceOffset,
        sourceLength: m.sourceLength,
        matchType: m.matchType as PlagiarismMatchResult["matchType"],
        matchedText: m.matchedText,
        matchedFrom: m.matchedFrom,
        matchedUrl: m.matchedUrl ?? undefined,
        similarity: m.similarity,
        riskLevel: m.riskLevel as PlagiarismMatchResult["riskLevel"],
      })),
      stats: {
        totalParagraphs: paragraphs.length,
        sampledParagraphs: eligibleCount,
        selfMatches: selfMatches.length,
        crossMatches: crossMatches.length,
        knowledgeMatches: knowledgeMatches.length,
        embeddingMatches: 0,
        webMatches: webMatches.length,
        clicheMatches: clicheMatches.length,
        aiMatches: aiMatches.length,
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

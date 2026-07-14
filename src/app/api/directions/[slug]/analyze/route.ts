import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionAnalyzeSchema } from "@/lib/validations";
import { callAINonStreaming, getAgentModelConfig } from "@/lib/ai";
import {
  buildDimensionPromptV2,
  buildPaperCandidatesPromptV2,
  buildSynthesisPrompt,
  buildAssetSummary,
} from "@/lib/prompts/direction";
import { localRAG } from "@/lib/rag";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";
import { getOwnedDirection } from "@/lib/direction-auth";
import { computeAnalysisFingerprint } from "@/lib/direction-analysis-fingerprint";
import { applySynthesisAdjustments } from "@/lib/direction-analysis-synthesis";
import type {
  DirectionAsset,
  AnalysisDimension,
  PaperCandidate,
  CrossDirectionOpportunity,
  RubricItem,
  RubricResponse,
  SynthesisResult,
} from "@/contracts/direction";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ==================== 常量 ====================

const BATCH_1 = ["D1", "D2", "D3", "D4"];
const BATCH_2 = ["D5", "D6", "D7"];
const DIMENSION_NAMES: Record<string, string> = {
  D1: "已有基础盘点", D2: "研究问题框架", D3: "研究缺口识别",
  D4: "数据质量与充分性", D5: "论文机会排序", D6: "实验补全路线",
  D7: "创新性与竞争分析", D8: "跨方向协同机会",
};
const DIMENSION_WEIGHTS: Record<string, number> = {
  D1: 0.15, D2: 0.15, D3: 0.15, D4: 0.15, D5: 0.15, D6: 0.10, D7: 0.10, D8: 0.05,
};

// ==================== JSON 解析 ====================

function parseAIJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* continue */ }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1]) as T;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("无法解析 AI 返回的 JSON");
}

// ==================== SSE 编码 ====================

function encoder() { return new TextEncoder(); }
function sseEvent(data: unknown): string { return `data: ${JSON.stringify(data)}\n\n`; }

// ==================== AI 调用（temperature=0） ====================

async function callAIZero(messages: { role: string; content: string }[], timeoutMs = 60_000): Promise<string> {
  const { provider, keyError } = getAgentModelConfig("writer");
  if (keyError) {
    logger.warn("writer agent key unavailable, falling back to deepseek", { keyError });
  }
  return callAINonStreaming({
    provider: keyError ? "deepseek" : provider,
    messages,
    timeoutMs,
  });
}

// ==================== 维度分析 ====================

async function analyzeDimension(
  dimId: string,
  assetSummary: string,
  rubricsText: string,
  literatureContext: string,
): Promise<AnalysisDimension> {
  const prompt = buildDimensionPromptV2(
    dimId,
    DIMENSION_NAMES[dimId],
    DIMENSION_WEIGHTS[dimId],
    rubricsText,
    assetSummary,
    literatureContext || undefined,
  );

  const raw = await callAIZero([
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ]);

  const result = parseAIJson<{
    score: number;
    confidence: "high" | "medium" | "low";
    rubricResponses: RubricResponse[];
    synthesis: string;
  }>(raw);

  // 从 rubric 响应中提取 block/warn
  const blockedBy = (result.rubricResponses || [])
    .filter((r) => !r.passed)
    .map((r) => r.explanation);

  return {
    id: dimId,
    name: DIMENSION_NAMES[dimId],
    weight: DIMENSION_WEIGHTS[dimId],
    score: Math.min(10, Math.max(1, result.score || 5)),
    summary: result.synthesis || "",
    whatTriggersBlock: blockedBy.length > 0 ? blockedBy.join("; ") : "",
    whatTriggersWarn: "",
    confidence: result.confidence || "medium",
    rubricResponses: result.rubricResponses || [],
  };
}

// ==================== Verifier 跨模型验证 ====================

async function runVerifier(
  dimId: string,
  writerScore: number,
  writerSummary: string,
  assetSummary: string,
  rubricsText: string,
): Promise<{ critique: string; confidenceAdjustment: number; flagged: boolean } | null> {
  // 仅 D3/D5 启用 Verifier
  if (dimId !== "D3" && dimId !== "D5") return null;

  const verifierConfig = getAgentModelConfig("verifier");
  if (verifierConfig.keyError || verifierConfig.provider !== "zhipu") {
    return null; // 降级：无 Zhipu key 时跳过
  }

  try {
    const verifierPrompt = `你是一位严谨的学术评审专家。你需要独立审查另一位 AI 对研究方向的「${dimId}」维度分析，质疑其评分和结论。

## 评价标准（Contract）

${rubricsText}

## 资产摘要

${assetSummary}

## Writer 的评分与结论

评分: ${writerScore}/10
摘要: ${writerSummary}

## 审查要求

1. Writer 的评分是否与 Contract 一致？有无故意迎合数据的倾向？
2. Writer 引用的证据是否真实存在于资产中？有没有夸大？
3. 如果有问题，给出具体的质疑和置信度调整建议。

输出 JSON（无 code fence）：
{
  "critique": "具体的质疑内容（100-200字）",
  "confidenceAdjustment": -0.1,
  "flagged": true
}`;

    const raw = await callAINonStreaming({
      provider: verifierConfig.provider,
      messages: [
        { role: "system", content: "你是学术评审专家，用中文回复。输出纯 JSON。" },
        { role: "user", content: verifierPrompt },
      ],
      timeoutMs: 30_000,
    });

    const result = parseAIJson<{
      critique: string;
      confidenceAdjustment: number;
      flagged: boolean;
    }>(raw);

    return {
      critique: result.critique || "",
      confidenceAdjustment: Math.max(-0.3, Math.min(0.3, result.confidenceAdjustment || 0)),
      flagged: result.flagged || false,
    };
  } catch {
    return null; // Verifier 失败不阻塞主流程
  }
}

// ==================== D5 输出校验 ====================

async function validateD5Candidates(
  candidates: PaperCandidate[],
  d4Score: number,
): Promise<{ valid: boolean; warnings: string[]; adjusted: PaperCandidate[] }> {
  const warnings: string[] = [];
  const adjusted = [...candidates];

  // 0. 预加载 journal-metrics 样本
  const knownJournals = new Set<string>();
  try {
    const files = await prisma.knowledgeFile.findMany({
      where: { metrics: { not: "" } },
      select: { metrics: true },
      take: 100,
    });
    for (const f of files) {
      try {
        const m = typeof f.metrics === "string" ? JSON.parse(f.metrics) : f.metrics;
        const jName = (m as Record<string, unknown>)?.journal as string;
        if (jName) knownJournals.add(jName.toLowerCase());
      } catch { /* skip */ }
    }
  } catch { /* non-blocking */ }

  for (let i = 0; i < adjusted.length; i++) {
    const c = adjusted[i];

    // 1. D4×D5 tier 一致性检查
    if (d4Score < 5 && c.tier === "ready") {
      warnings.push(`候选 "${c.title}" tier=ready 与 D4 评分 ${d4Score} 不一致 → 降级为 needs_experiment`);
      adjusted[i] = { ...c, tier: "needs_experiment" };
    }
    if (d4Score < 3 && c.tier !== "long_term") {
      warnings.push(`候选 "${c.title}" tier=${c.tier} 与 D4 评分 ${d4Score} 不一致 → 降级为 long_term`);
      adjusted[i] = { ...c, tier: "long_term" };
    }

    // 2. suggestedJournal 真实匹配
    if (c.suggestedJournal && knownJournals.size > 0) {
      const normalized = c.suggestedJournal.toLowerCase();
      const found = Array.from(knownJournals).some((j) =>
        j.includes(normalized) || normalized.includes(j),
      );
      if (!found) {
        warnings.push(
          `候选 "${c.title}" 的期刊 "${c.suggestedJournal}" 在本地 journal-metrics 中未找到匹配。建议确认或更换为库内期刊。`,
        );
      }
    }
  }

  // 3. 论文候选去重检测
  const seenTitles = new Map<string, number>();
  for (let i = 0; i < adjusted.length; i++) {
    const key = adjusted[i].title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
    if (seenTitles.has(key)) {
      warnings.push(
        `候选 #${seenTitles.get(key)! + 1} "${adjusted[seenTitles.get(key)!].title}" 与候选 #${i + 1} "${adjusted[i].title}" 高度相似，可能存在重复。`,
      );
    }
    seenTitles.set(key, i);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    adjusted,
  };
}

// ==================== 文献检索 ====================

async function getLiteratureContext(
  assets: DirectionAsset[],
  categories: string[],
): Promise<string> {
  try {
    const keywords = assets
      .filter((a) => a.kind === "experiment")
      .flatMap((a) => {
        const exp = a as { researchQuestion?: string; keyFindings?: string; title?: string };
        return [exp.researchQuestion, exp.keyFindings, exp.title].filter(Boolean);
      })
      .slice(0, 10)
      .join(" ");

    if (!keywords.trim()) return "";

    // 搜全部分类（不限定单个分类，捕获跨分类文献）
    const results = await localRAG.search(keywords, {
      limit: 8,
      ...(categories.length > 0 ? { categories } : {}),
    });

    if (!results || results.length === 0) return "";

    const snippets = results
      .slice(0, 5)
      .map((r: { metadata: { source: string }; content: string }) =>
        `[${r.metadata.source}] ${r.content.slice(0, 400)}...`)
      .join("\n\n");

    return `以下是从知识库检索到的相关文献片段（用于研究缺口识别和背景对照）：\n\n${snippets}`;
  } catch {
    return "";
  }
}

// ==================== POST ====================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return unauthorizedResponse();

  const { slug } = await params;
  let aborted = false;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        if (aborted) return;
        try { controller.enqueue(encoder().encode(sseEvent(data))); } catch { aborted = true; }
      };
      const emitError = (message: string) => {
        emit({ type: "error", message });
        try { controller.close(); } catch { /* ignore */ }
      };

      try {
        // 0. 校验请求
        const body = await req.json();
        const parsed = await validateBody(directionAnalyzeSchema, body);
        if (parsed.errorResponse) { emitError("请求参数校验失败"); return; }
        const mode = parsed.data?.mode ?? "full";

        // 1. 加载方向数据
        const direction = await getOwnedDirection(slug, userId);
        if (!direction) { emitError("方向不存在"); return; }

        const assets: DirectionAsset[] = Array.isArray(direction.assets)
          ? (direction.assets as unknown as DirectionAsset[])
          : [];
        const currentAnalysis = (direction.analysis as Record<string, unknown> | null) || {};
        const evaluationContract = currentAnalysis.evaluationContract as
          { dimensions?: Array<{ id: string; name: string; weight: number; rubrics: RubricItem[] }>; confirmedAt?: number } | undefined;

        if (assets.length < 3) { emitError("资产数量不足（最少 3 项），无法触发分析"); return; }

        const contractConfirmed = !!evaluationContract?.confirmedAt;
        if (mode !== "quick" && !contractConfirmed) {
          emitError("请先完成 Phase 1 预承诺并确认评价标准");
          return;
        }

        const storedDimensions = (currentAnalysis.dimensions as AnalysisDimension[] | undefined) || [];
        const storedDimMap = new Map(storedDimensions.map((d) => [d.id, d]));
        const isGapOnly = mode === "gap-only" && storedDimensions.length >= 4;

        // 2. 构建资产摘要
        const assetSummary = buildAssetSummary(assets);

        // 3. 构建 Rubrics 文本
        const contractDimensions = evaluationContract?.dimensions || [];
        const rubricsMap = new Map<string, string>();
        for (const dim of contractDimensions) {
          if (dim.rubrics && dim.rubrics.length > 0) {
            const text = dim.rubrics.map((r) =>
              `**${r.id}**: ${r.what_to_look_for}\n  Block: ${r.what_triggers_block}\n  Warn: ${r.what_triggers_warn}\n  需引用: ${r.evidence_required}`
            ).join("\n\n");
            rubricsMap.set(dim.id, text);
          }
        }

        const getRubrics = (dimId: string): string => {
          return rubricsMap.get(dimId) || `（维度 ${dimId} 未设置 Rubrics，请按通用 SCI 质量标准评分）`;
        };

        // 4. 文献检索（知识库接入）
        const categories = (direction.categories as string[]) || [];
        const literatureContext = await getLiteratureContext(assets, categories);

        // 5. 批次 1：并行 D1-D4（gap-only 仅重跑 D3）
        const batch1Dims = isGapOnly ? ["D3"] : BATCH_1;
        emit({ type: "batch_start", batch: 1, dimensions: batch1Dims });

        const resultsD1D4 = new Map<string, AnalysisDimension>();
        if (isGapOnly) {
          for (const id of ["D1", "D2", "D4"] as const) {
            const stored = storedDimMap.get(id);
            if (stored) resultsD1D4.set(id, stored);
          }
        }

        const batch1Promises = batch1Dims.map(async (dimId) => {
          try {
            emit({ type: "dimension_start", dimensionId: dimId, provider: "deepseek" });
            const dim = await analyzeDimension(dimId, assetSummary, getRubrics(dimId), literatureContext);

            // D3 Verifier 跨模型验证
            if (dimId === "D3") {
              const verifierResult = await runVerifier(dimId, dim.score, dim.summary, assetSummary, getRubrics(dimId));
              if (verifierResult) {
                emit({ type: "verifier_start", dimensionId: dimId, provider: "zhipu" });
                if (verifierResult.flagged) {
                  dim.confidence = verifierResult.confidenceAdjustment < -0.15 ? "low" : "medium";
                  dim.summary += `\n\n[Verifier 审查] ${verifierResult.critique}`;
                }
                emit({ type: "verifier_done", dimensionId: dimId, critique: verifierResult.critique, confidenceAdjustment: verifierResult.confidenceAdjustment });
              }
            }

            resultsD1D4.set(dimId, dim);
            emit({ type: "dimension_done", dimensionId: dimId, result: dim });
          } catch (err) {
            logger.error(`${dimId} failed:`, err);
            emit({ type: "dimension_error", dimensionId: dimId, error: getErrorMessage(err) || `${dimId} 分析失败` });
            resultsD1D4.set(dimId, fallbackDimension(dimId));
          }
        });

        await Promise.all(batch1Promises);
        emit({ type: "batch_done", batch: 1 });
        if (aborted) return;

        // 6. 批次 2：D5-D7（gap-only 重跑 D5/D6，复用 D7）
        const batch2Run = isGapOnly ? ["D5", "D6"] : BATCH_2;
        emit({ type: "batch_start", batch: 2, dimensions: batch2Run });
        let capturedCandidates: PaperCandidate[] = [];

        // D5 专用（论文候选识别）
        const dimD4 = resultsD1D4.get("D4");
        const d4ResultText = dimD4
          ? `评分: ${dimD4.score}/10。${dimD4.summary}`
          : "D4 分析未完成，无法提供数据质量反馈。请保守评级。";

        let dimD5: AnalysisDimension;
        try {
          emit({ type: "dimension_start", dimensionId: "D5", provider: "deepseek" });
          const d5Prompt = buildPaperCandidatesPromptV2(assetSummary, d4ResultText, getRubrics("D5"));
          const d5Raw = await callAIZero([
            { role: "system", content: d5Prompt.system },
            { role: "user", content: d5Prompt.user },
          ]);
          const d5Result = parseAIJson<{
            candidates: Array<{
              id: string;
              title: string;
              tier: "ready" | "needs_experiment" | "long_term";
              dimensionScores: Record<string, number>;
              overallScore: number;
              requiredExperiments: string[];
              estimatedCompletion: string;
              suggestedJournal?: string;
              dataBasis?: string[];
            }>;
          }>(d5Raw);

          capturedCandidates = (d5Result.candidates || []).map((c) => ({
            ...c,
            dimensionScores: c.dimensionScores || {},
            requiredExperiments: c.requiredExperiments || [],
          }));

          // D5 Verifier 跨模型验证
          const d5VerifierResult = await runVerifier("D5", 7, `候选论文 ${capturedCandidates.length} 篇，ready ${capturedCandidates.filter((c) => c.tier === "ready").length} 篇`, assetSummary, getRubrics("D5"));
          if (d5VerifierResult) {
            emit({ type: "verifier_start", dimensionId: "D5", provider: "zhipu" });
            emit({ type: "verifier_done", dimensionId: "D5", critique: d5VerifierResult.critique, confidenceAdjustment: d5VerifierResult.confidenceAdjustment });
          }

          // D5 输出校验（D4 联动 + journal-metrics 匹配）
          const validation = await validateD5Candidates(capturedCandidates, dimD4?.score || 5);
          if (validation.warnings.length > 0) {
            capturedCandidates = validation.adjusted;
            emit({ type: "dimension_delta", dimensionId: "D5", delta: `校验警告: ${validation.warnings.join("; ")}` });
          }

          emit({ type: "candidates", candidates: capturedCandidates });

          const readyCount = capturedCandidates.filter((c) => c.tier === "ready").length;
          dimD5 = {
            id: "D5", name: DIMENSION_NAMES["D5"], weight: DIMENSION_WEIGHTS["D5"],
            score: Math.min(10, Math.round(readyCount * 2 + capturedCandidates.length * 0.5)),
            summary: `识别出 ${capturedCandidates.length} 个论文候选：${readyCount} 篇可立即启动。`,
            whatTriggersBlock: readyCount === 0 ? "无可立即启动的论文" : "",
            whatTriggersWarn: "", confidence: "medium",
          };
        } catch (err) {
          logger.error("D5 failed:", err);
          emit({ type: "dimension_error", dimensionId: "D5", error: getErrorMessage(err) || "D5 分析失败" });
          dimD5 = fallbackDimension("D5");
        }

        // D6, D7 并行（gap-only 复用 D7）
        const dimD6DimD7Ids = isGapOnly ? (["D6"] as const) : (["D6", "D7"] as const);
        const dimD6DimD7Results = await Promise.all(
          dimD6DimD7Ids.map(async (dimId) => {
            try {
              emit({ type: "dimension_start", dimensionId: dimId, provider: "deepseek" });
              const dim = await analyzeDimension(dimId, assetSummary, getRubrics(dimId), "");
              return dim;
            } catch (err) {
              logger.error(`${dimId} failed:`, err);
              emit({ type: "dimension_error", dimensionId: dimId, error: getErrorMessage(err) || `${dimId} 分析失败` });
              return fallbackDimension(dimId);
            }
          }),
        );
        const dimD6 = dimD6DimD7Results[0];
        const dimD7 = isGapOnly
          ? (storedDimMap.get("D7") || fallbackDimension("D7"))
          : dimD6DimD7Results[1];

        emit({ type: "dimension_done", dimensionId: "D5", result: dimD5 });
        emit({ type: "dimension_done", dimensionId: "D6", result: dimD6 });
        emit({ type: "dimension_done", dimensionId: "D7", result: dimD7 });
        emit({ type: "batch_done", batch: 2 });
        if (aborted) return;

        // 7. D8（gap-only 复用）
        emit({ type: "batch_start", batch: 3, dimensions: ["D8"] });
        const allSoFar = [...resultsD1D4.values(), dimD5, dimD6, dimD7]
          .map((d) => `**${d.id} ${d.name}**: ${d.summary}`).join("\n\n");

        let dimD8: AnalysisDimension;
        if (isGapOnly && storedDimMap.has("D8")) {
          dimD8 = storedDimMap.get("D8")!;
          emit({ type: "dimension_done", dimensionId: "D8", result: dimD8 });
        } else {
          try {
            emit({ type: "dimension_start", dimensionId: "D8", provider: "deepseek" });
            dimD8 = await analyzeDimension("D8", `${assetSummary}\n\n## 其他维度摘要\n\n${allSoFar}`, getRubrics("D8"), "");
          } catch (err) {
            logger.error("D8 failed:", err);
            emit({ type: "dimension_error", dimensionId: "D8", error: getErrorMessage(err) || "D8 分析失败" });
            dimD8 = fallbackDimension("D8");
          }
          emit({ type: "dimension_done", dimensionId: "D8", result: dimD8 });
        }
        emit({ type: "batch_done", batch: 3 });

        // 8. 合成阶段
        emit({ type: "batch_start", batch: 4, dimensions: ["SYNTHESIS"] });
        const allDimensions = [...resultsD1D4.values(), dimD5, dimD6, dimD7, dimD8];
        const orderedDimensions = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"].map(
          (id) => allDimensions.find((d) => d.id === id)!,
        );

        let synthesis: SynthesisResult | undefined;
        try {
          const dimsText = orderedDimensions.map((d) =>
            `### ${d.id} ${d.name} (${d.score}/10, confidence=${d.confidence})\n${d.summary}`
          ).join("\n\n");
          const synPrompt = buildSynthesisPrompt(dimsText);
          const synRaw = await callAIZero([
            { role: "system", content: synPrompt.system },
            { role: "user", content: synPrompt.user },
          ]);
          synthesis = parseAIJson<SynthesisResult>(synRaw);
          emit({ type: "synthesis", synthesis });
        } catch (err) {
          logger.error("synthesis failed:", err);
        }
        emit({ type: "batch_done", batch: 4 });

        // 8b. 合成修正写回维度与候选
        const reconciled = applySynthesisAdjustments(
          orderedDimensions,
          capturedCandidates,
          synthesis,
        );
        const finalDimensions = reconciled.dimensions;
        capturedCandidates = reconciled.candidates;

        const crossDirectionOpportunities = await extractCrossDirectionFromD8(dimD8, slug, userId);
        if (crossDirectionOpportunities.length > 0) {
          emit({ type: "cross_direction", opportunities: crossDirectionOpportunities });
        }

        // 9. 保存
        const analysisPayload = {
          generatedAt: Date.now(),
          analysisFingerprint: computeAnalysisFingerprint(assets, evaluationContract),
          dimensions: finalDimensions,
          paperCandidates: capturedCandidates,
          crossDirectionOpportunities,
          synthesis: synthesis || null,
          evaluationContract: evaluationContract || null,
          grantProposal: (currentAnalysis.grantProposal as unknown) ?? null,
        };

        const cleanPayload = JSON.parse(JSON.stringify(analysisPayload));
        await prisma.direction.update({
          where: { id: direction.id },
          data: { analysis: cleanPayload as unknown as Prisma.InputJsonValue },
        });

        emit({ type: "done", analysis: analysisPayload });
      } catch (error: unknown) {
        logger.fail("direction analyze failed", error);
        emitError(getErrorMessage(error) || "分析过程出错");
      } finally {
        try { controller.close(); } catch { /* ignore */ }
      }
    },
    cancel() { aborted = true; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ==================== 辅助 ====================

function fallbackDimension(id: string): AnalysisDimension {
  return {
    id, name: DIMENSION_NAMES[id] || id, weight: DIMENSION_WEIGHTS[id] || 0.1,
    score: 0, summary: "该维度分析失败。",
    whatTriggersBlock: "", whatTriggersWarn: "", confidence: "low",
  };
}

/** 从 D8 维度提取跨方向协同机会，匹配真实方向列表 */
async function extractCrossDirectionFromD8(
  dimD8: AnalysisDimension | undefined,
  currentSlug: string,
  userId: string,
): Promise<CrossDirectionOpportunity[]> {
  if (!dimD8 || dimD8.score < 3) return [];

  let knownDirections: Array<{ slug: string; name: string }> = [];
  try {
    knownDirections = await prisma.direction.findMany({
      where: { status: "active", userId, slug: { not: currentSlug } },
      select: { slug: true, name: true },
    });
  } catch { return []; }

  const summary = dimD8.summary || "";
  const evidenceText = (dimD8.rubricResponses || [])
    .filter((r) => r.passed)
    .flatMap((r) => r.evidence)
    .join(" ");

  const combinedText = `${summary} ${evidenceText}`;

  const opportunities: CrossDirectionOpportunity[] = [];
  for (const dir of knownDirections) {
    // 检查 D8 文本中是否提及了其他方向的名字
    if (combinedText.includes(dir.name)) {
      // 提取相关的句子片段
      const idx = combinedText.indexOf(dir.name);
      const context = combinedText.slice(Math.max(0, idx - 50), Math.min(combinedText.length, idx + dir.name.length + 100));

      opportunities.push({
        directionSlug: dir.slug,
        description: context.trim(),
        confidence: dimD8.confidence || "low",
        synergyPoints: [
          `D8 评分 ${dimD8.score}/10：${dimD8.summary.slice(0, 80)}`,
        ],
      });
    }
  }

  return opportunities;
}

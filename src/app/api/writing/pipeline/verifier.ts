import { localRAG } from "@/lib/rag";
import { collectCitationFirstAppearance } from "@/lib/reference-reorder";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildVerifierSystemPrompt, buildVerifierPrompt } from "@/lib/prompts";
import { getActiveWritingCount, getWritingMaxConcurrent } from "@/lib/writing-concurrency";
import {
  formatVerificationIssuesForRefiner,
  hasActionableVerificationIssues,
  parseVerificationReport,
  type VerificationReport,
} from "@/contracts/writing-verification";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

/** verifier 流式进度标记：〔进度 n/N〕 */
const PROGRESS_MARKER_GLOBAL = /〔进度\s*(\d+)\s*\/\s*(\d+)\s*〕/g;

/** 从累积报告文本提取所有进度标记；无则空数组 */
export function findVerificationProgressMarkers(
  content: string,
): Array<{ checked: number; total: number }> {
  const out: Array<{ checked: number; total: number }> = [];
  for (const m of content.matchAll(PROGRESS_MARKER_GLOBAL)) {
    out.push({ checked: Number(m[1]), total: Number(m[2]) });
  }
  return out;
}

/** 从报告文本移除进度标记（防止污染 verificationReport） */
export function stripProgressMarkers(content: string): string {
  return content.replace(PROGRESS_MARKER_GLOBAL, "");
}

/**
 * 计算累积剥离后报告的可发射增量。
 * 若报告尾部有未完成的 `〔进度` 前缀，则暂存不发射（等补全后 strip 掉）。
 */
export function computeCleanEmission(
  strippedReport: string,
  lastEmitted: number,
): { delta: string; nextEmitted: number } {
  const tail = strippedReport.match(/(〔进度\s*[\d\s/]*)$/);
  const holdLen = tail ? tail[1].length : 0;
  const cleanEnd = strippedReport.length - holdLen;
  return {
    delta: strippedReport.slice(lastEmitted, cleanEnd),
    nextEmitted: cleanEnd,
  };
}

function resolveVerifierMaxFullSources(): number {
  const raw = process.env.WRITING_VERIFIER_MAX_FULL_SOURCES;
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) {
      if (n === 0) return 0;
      const underLoad =
        getActiveWritingCount() >= getWritingMaxConcurrent();
      return underLoad ? Math.min(2, n) : n;
    }
  }
  const underLoad = getActiveWritingCount() >= getWritingMaxConcurrent();
  return underLoad ? 2 : 5;
}

export interface VerifierPhaseResult {
  verificationReport: string;
  failedVerificationIssues: boolean;
  structuredReport: VerificationReport;
}

export async function runVerifierPhase(
  initialDraft: string,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
  userId: string | undefined,
  signal: AbortSignal,
  projectMode?: "review" | "research",
): Promise<VerifierPhaseResult> {
  const { contextText, globalReferenceInfo, referencesByIndex } = prepared;

  emit({ type: "status", status: "verifying" });

  const citedIndices = collectCitationFirstAppearance(initialDraft, referencesByIndex.length);
  const maxFullSources = resolveVerifierMaxFullSources();
  const fullSourceChunks: string[] = [];
  let sourceIdx = 0;
  let loadedSources = 0;
  const citedList = citedIndices.filter((idx) => referencesByIndex[idx - 1]);
  if (maxFullSources > 0) {
    for (const idx of citedIndices) {
      const sourceName = referencesByIndex[idx - 1];
      if (!sourceName) continue;
      loadedSources += 1;
      emit({
        type: "pipeline_step",
        step: "verifying",
        status: "running",
        detail: `加载引用原文 ${loadedSources}/${citedList.length || "?"}…`,
      });
      const fullText = await localRAG.getFullText(sourceName);
      if (!fullText) continue;
      sourceIdx++;
      if (sourceIdx <= maxFullSources) {
        const trimmed =
          fullText.length > 2000
            ? fullText.slice(0, 1000) + "\n…[省略]…\n" + fullText.slice(-1000)
            : fullText;
        fullSourceChunks.push(`=== [${idx}] ${sourceName} 全文 ===\n${trimmed}`);
      } else {
        fullSourceChunks.push(`=== [${idx}] ${sourceName} 摘要 ===\n${fullText.slice(0, 300)}…`);
      }
    }
  } else if (citedList.length > 0) {
    emit({
      type: "info",
      info: "系统负载较高，核查阶段跳过引用全文加载，仅基于检索摘要审查",
    });
  }

  const verifierPrompt = buildVerifierPrompt({
    contextText,
    content: initialDraft,
    globalReferenceInfo,
    fullSourceTexts: fullSourceChunks.length > 0 ? fullSourceChunks.join("\n\n") : undefined,
    projectMode,
  });

  let verificationReport = "";
  const { provider: verifierProvider, keyError: verifierKeyError } = getAgentModelConfig("verifier");
  const actualVerifierProvider = verifierKeyError ? "deepseek" : verifierProvider;

  if (actualVerifierProvider !== getAgentModelConfig("writer").provider) {
    emit({
      type: "info",
      info: `使用 ${actualVerifierProvider === "zhipu" ? "智谱AI" : "DeepSeek"} 进行独立验证`,
    });
  }

  emit({
    type: "pipeline_step",
    step: "verifying",
    status: "running",
    detail: "独立 AI 正在核查引用真实性...",
  });

  try {
    const verifierResponse = await callAI({
      userId,
      provider: actualVerifierProvider,
      messages: [
        { role: "system", content: buildVerifierSystemPrompt("full", projectMode) },
        { role: "user", content: verifierPrompt },
      ],
      signal,
      timeoutMs: 180_000,
    });

    let lastChecked = -1;
    let cleanEmitted = 0;
    if (verifierResponse.ok && verifierResponse.body) {
      for await (const chunk of streamAIResponse(verifierResponse, signal, 180_000)) {
        if (chunk.content) {
          verificationReport += chunk.content;
          for (const m of findVerificationProgressMarkers(verificationReport)) {
            if (m.checked > lastChecked) {
              lastChecked = m.checked;
              emit({ type: "verification_progress", checked: m.checked, total: m.total });
            }
          }
          verificationReport = stripProgressMarkers(verificationReport);
          const { delta, nextEmitted } = computeCleanEmission(verificationReport, cleanEmitted);
          cleanEmitted = nextEmitted;
          if (delta) emit({ type: "verification", verification: delta });
        }
      }
    }
  } catch (e: unknown) {
    const reason = e instanceof DOMException && e.name === "AbortError" ? "核查超时" : "核查失败";
    verificationReport = `核查请求${reason}，跳过自动审查。`;
    emit({ type: "verification", verification: verificationReport });
  }

  const structuredReport = parseVerificationReport(verificationReport);
  emit({ type: "review_report", report: structuredReport });

  const failedVerificationIssues = hasActionableVerificationIssues(structuredReport);

  const feedbackForRefine = failedVerificationIssues
    ? formatVerificationIssuesForRefiner(structuredReport)
    : structuredReport.summary;

  emit({
    type: "pipeline_step",
    step: "verifying",
    status: "done",
    detail: failedVerificationIssues
      ? `发现问题 ${structuredReport.issues.length} 条`
      : "核查通过",
  });

  return {
    verificationReport: feedbackForRefine || verificationReport,
    failedVerificationIssues,
    structuredReport,
  };
}

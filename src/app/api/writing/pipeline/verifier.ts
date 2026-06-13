import { localRAG } from "@/lib/rag";
import { collectCitationFirstAppearance } from "@/lib/reference-reorder";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildVerifierSystemPrompt, buildVerifierPrompt } from "@/lib/prompts";
import { getActiveWritingCount, getWritingMaxConcurrent } from "@/lib/writing-concurrency";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

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

    if (verifierResponse.ok && verifierResponse.body) {
      for await (const chunk of streamAIResponse(verifierResponse, signal, 180_000)) {
        if (chunk.content) {
          verificationReport += chunk.content;
          emit({ type: "verification", verification: chunk.content });
        }
      }
    }
  } catch (e: unknown) {
    const reason = e instanceof DOMException && e.name === "AbortError" ? "核查超时" : "核查失败";
    verificationReport = `核查请求${reason}，跳过自动审查。`;
    emit({ type: "verification", verification: verificationReport });
  }

  const failedVerificationIssues =
    Boolean(verificationReport) &&
    !verificationReport.trim().toUpperCase().startsWith("PASS") &&
    verificationReport.length > 20;

  emit({
    type: "pipeline_step",
    step: "verifying",
    status: "done",
    detail: failedVerificationIssues ? "发现问题" : "核查通过",
  });

  return { verificationReport, failedVerificationIssues };
}

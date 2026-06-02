import { localRAG } from "@/lib/rag";
import { collectCitationFirstAppearance } from "@/lib/reference-reorder";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildVerifierSystemPrompt, buildVerifierPrompt } from "@/lib/prompts";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

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
  const MAX_FULL_SOURCES = 5;
  const fullSourceChunks: string[] = [];
  let sourceIdx = 0;
  for (const idx of citedIndices) {
    const sourceName = referencesByIndex[idx - 1];
    if (!sourceName) continue;
    const fullText = await localRAG.getFullText(sourceName);
    if (!fullText) continue;
    sourceIdx++;
    if (sourceIdx <= MAX_FULL_SOURCES) {
      const trimmed =
        fullText.length > 2000
          ? fullText.slice(0, 1000) + "\n…[省略]…\n" + fullText.slice(-1000)
          : fullText;
      fullSourceChunks.push(`=== [${idx}] ${sourceName} 全文 ===\n${trimmed}`);
    } else {
      fullSourceChunks.push(`=== [${idx}] ${sourceName} 摘要 ===\n${fullText.slice(0, 300)}…`);
    }
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
      timeoutMs: 60_000,
    });

    if (verifierResponse.ok && verifierResponse.body) {
      for await (const chunk of streamAIResponse(verifierResponse, signal)) {
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

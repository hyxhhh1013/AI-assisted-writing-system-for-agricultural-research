import { callAINonStreaming, getAgentModelConfig } from "@/lib/ai";
import { buildRefinerSystemPrompt, buildRefinerPrompt } from "@/lib/prompts";
import {
  collectInvalidCitationNumbers,
  stripOutOfRangeCitations,
} from "@/lib/reference-reorder";
import { normalizeAllCitationFormats } from "@/lib/citation";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RefinerPhaseResult {
  refinedDraft: string;
  correctedDraft: string;
}

export async function runRefinerPhase(
  initialDraft: string,
  finalDraft: string,
  verificationReport: string,
  failedVerificationIssues: boolean,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
  userId: string | undefined,
  signal: AbortSignal,
  projectMode?: "review" | "research",
): Promise<RefinerPhaseResult> {
  const { contextText, referencesByIndex } = prepared;
  const maxRefIndex = referencesByIndex.length;

  const normalizedDraft = normalizeAllCitationFormats(finalDraft || initialDraft);
  const correctedDraft = stripOutOfRangeCitations(normalizedDraft, maxRefIndex);
  if (correctedDraft !== (finalDraft || initialDraft)) {
    emit({ type: "corrected_text", text: correctedDraft });
  }

  const lingeringInvalid = collectInvalidCitationNumbers(correctedDraft, maxRefIndex);
  if (lingeringInvalid.length > 0) {
    emit({
      type: "info",
      info: `检测到 ${lingeringInvalid.length} 处越界引用 [${lingeringInvalid.join(", ")}]，已替换为占位标记。请检查修正后的文本。`,
    });
  }

  let refinedDraft = correctedDraft;
  if (failedVerificationIssues && verificationReport) {
    emit({ type: "status", status: "refining" });
    emit({
      type: "pipeline_step",
      step: "refining",
      status: "running",
      detail: "主编根据审稿意见修正中...",
    });
    emit({ type: "clear_result" });

    try {
      const refinerPrompt = buildRefinerPrompt({
        contextText,
        feedback: verificationReport,
        content: correctedDraft,
        isFixOnly: false,
      });

      const correctedText = await callAINonStreaming({
        userId,
        provider: getAgentModelConfig("refiner").provider,
        messages: [
          { role: "system", content: buildRefinerSystemPrompt(projectMode) },
          { role: "user", content: refinerPrompt },
        ],
        signal,
        timeoutMs: 180_000,
      });

      if (correctedText && correctedText.trim().length > 10) {
        refinedDraft = stripOutOfRangeCitations(
          normalizeAllCitationFormats(correctedText.trim()),
          maxRefIndex,
        );
        emit({ type: "corrected_text", text: refinedDraft });
        emit({ type: "pipeline_step", step: "refining", status: "done", detail: "已修正" });
      } else {
        emit({
          type: "pipeline_step",
          step: "refining",
          status: "done",
          detail: "修正返回为空，保留原稿",
        });
      }
    } catch (e: unknown) {
      const reason =
        e instanceof DOMException && e.name === "AbortError"
          ? "修正超时"
          : `修正失败: ${e instanceof Error ? e.message : "未知错误"}`;
      emit({ type: "pipeline_step", step: "refining", status: "done", detail: reason });
    }
  } else {
    emit({
      type: "pipeline_step",
      step: "refining",
      status: "done",
      detail: verificationReport ? "核查通过，无需修正" : "无核查意见",
    });
  }

  await tick(40);

  const lingeringAfterRefine = collectInvalidCitationNumbers(refinedDraft, maxRefIndex);
  if (lingeringAfterRefine.length > 0) {
    emit({
      type: "info",
      info: `修正后发现 ${lingeringAfterRefine.length} 处越界引用 [${lingeringAfterRefine.join(", ")}]，已处理。`,
    });
  }

  return { refinedDraft, correctedDraft };
}

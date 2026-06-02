import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import {
  buildVerifierSystemPrompt,
  buildVerifierPrompt,
  buildRefinerSystemPrompt,
  buildRefinerPrompt,
} from "@/lib/prompts";
import type { WritingPipelineRunParams, PreparedWritingContext } from "../types";

/** audit_only：仅流式输出核查报告 */
export async function runAuditOnlyMode(
  params: WritingPipelineRunParams,
  prepared: PreparedWritingContext,
): Promise<void> {
  const { context, userId, emit, finishStream } = params;
  const { contextText } = prepared;

  emit({ type: "status", status: "verifying" });
  const prompt = buildVerifierPrompt({ contextText, content: context });

  const response = await callAI({
    userId,
    provider: getAgentModelConfig("verifier").provider,
    messages: [
      { role: "system", content: buildVerifierSystemPrompt("audit") },
      { role: "user", content: prompt },
    ],
  });

  for await (const chunk of streamAIResponse(response)) {
    if (chunk.content) {
      emit({ type: "verification", verification: chunk.content });
    }
  }
  finishStream();
}

/** fix_only：按人工意见流式修正 */
export async function runFixOnlyMode(
  params: WritingPipelineRunParams,
  prepared: PreparedWritingContext,
): Promise<void> {
  const { context, data, userId, emit, finishStream } = params;
  const { contextText } = prepared;
  const manualFeedback = data.verificationFeedback!;

  emit({ type: "status", status: "refining" });
  const prompt = buildRefinerPrompt({
    contextText,
    feedback: manualFeedback,
    content: context,
    isFixOnly: true,
  });

  const response = await callAI({
    userId,
    provider: getAgentModelConfig("refiner").provider,
    messages: [
      { role: "system", content: buildRefinerSystemPrompt() },
      { role: "user", content: prompt },
    ],
  });

  for await (const chunk of streamAIResponse(response)) {
    if (chunk.content) {
      emit({ type: "delta", content: chunk.content });
    }
  }
  finishStream();
}

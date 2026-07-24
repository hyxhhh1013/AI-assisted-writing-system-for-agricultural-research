import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import {
  buildVerifierSystemPrompt,
  buildVerifierPrompt,
  buildRefinerSystemPrompt,
  buildRefinerPrompt,
} from "@/lib/prompts";
import {
  formatVerificationIssuesForRefiner,
  parseVerificationReport,
} from "@/contracts/writing-verification";
import type { WritingPipelineRunParams, PreparedWritingContext } from "../types";
import { finalizeAndEmitCitations } from "./finalize";

/** audit_only：流式核查 + 终态结构化 review_report */
export async function runAuditOnlyMode(
  params: WritingPipelineRunParams,
  prepared: PreparedWritingContext,
): Promise<void> {
  const { context, userId, emit, finishStream, data } = params;
  const { contextText } = prepared;
  const projectMode = data.projectMode;

  emit({ type: "status", status: "verifying" });
  const prompt = buildVerifierPrompt({ contextText, content: context, projectMode });

  const response = await callAI({
    userId,
    provider: getAgentModelConfig("verifier").provider,
    messages: [
      { role: "system", content: buildVerifierSystemPrompt("audit", projectMode) },
      { role: "user", content: prompt },
    ],
  });

  let raw = "";
  for await (const chunk of streamAIResponse(response)) {
    if (chunk.content) {
      raw += chunk.content;
      emit({ type: "verification", verification: chunk.content });
    }
  }

  const report = parseVerificationReport(raw);
  emit({ type: "review_report", report });
  finishStream();
}

/** fix_only：按人工意见或勾选 issue 流式修正 */
export async function runFixOnlyMode(
  params: WritingPipelineRunParams,
  prepared: PreparedWritingContext,
): Promise<void> {
  const { context, data, userId, emit, finishStream } = params;
  const { contextText } = prepared;
  let manualFeedback = data.verificationFeedback || "";

  // 若 feedback 本身是结构化 JSON，按 selectedIssueIds 过滤
  if (manualFeedback.trim().startsWith("{")) {
    const report = parseVerificationReport(manualFeedback);
    if (report.issues.length > 0) {
      manualFeedback = formatVerificationIssuesForRefiner(
        report,
        data.selectedIssueIds,
      );
    }
  }

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
      { role: "system", content: buildRefinerSystemPrompt(data.projectMode) },
      { role: "user", content: prompt },
    ],
  });

  let draft = "";
  for await (const chunk of streamAIResponse(response)) {
    if (chunk.content) {
      draft += chunk.content;
      emit({ type: "delta", content: chunk.content });
    }
  }

  finalizeAndEmitCitations(draft, prepared, emit);
  finishStream();
}

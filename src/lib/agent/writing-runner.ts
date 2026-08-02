import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingSSEEvent } from "@/contracts/sse";
import { runWritingPipeline } from "@/app/api/writing/run-pipeline";
import type { WritingGlobalContext } from "@/app/api/writing/types";
import type { WritingInput } from "@/lib/validations";
import {
  collectInvalidCitationNumbers,
  stripEmbeddedBibliography,
  stripOutOfRangeCitations,
} from "@/lib/reference-reorder";
import { normalizeAllCitationFormats } from "@/lib/citation";
import { callAINonStreaming, getAgentModelConfig } from "@/lib/ai";
import { buildRefinerPrompt, buildRefinerSystemPrompt } from "@/lib/prompts";
import {
  releaseWritingSlot,
  tryAcquireWritingSlot,
} from "@/lib/writing-concurrency";

export interface AgentRefineContentInput {
  draft: string;
  feedback: string;
  contextText: string;
  maxRefIndex: number;
  projectMode?: "review" | "research";
  userId: string;
  signal: AbortSignal;
}

export interface AgentRefineContentResult {
  draft: string;
  charCount: number;
}

/** Agent refine_content：复用 Refiner（fix_only 路径） */
export async function runAgentRefineContent(
  input: AgentRefineContentInput,
): Promise<AgentRefineContentResult> {
  const draft = input.draft.trim();
  const feedback = input.feedback.trim();
  if (!draft) throw new Error("draft 不能为空");
  if (!feedback) throw new Error("feedback 不能为空");

  const { keyError } = getAgentModelConfig("refiner");
  if (keyError) throw new Error(keyError);

  if (!tryAcquireWritingSlot()) {
    throw new Error("扩写并发已满，请稍后再试");
  }

  try {
    const prompt = buildRefinerPrompt({
      contextText: input.contextText || "（无检索上下文）",
      feedback,
      content: draft,
      isFixOnly: true,
    });

    const correctedText = await callAINonStreaming({
      userId: input.userId,
      provider: getAgentModelConfig("refiner").provider,
      messages: [
        { role: "system", content: buildRefinerSystemPrompt(input.projectMode) },
        { role: "user", content: prompt },
      ],
      signal: input.signal,
      timeoutMs: 180_000,
    });

    if (!correctedText || correctedText.trim().length < 10) {
      throw new Error("Refiner 未返回有效正文");
    }

    let refined = stripEmbeddedBibliography(
      normalizeAllCitationFormats(correctedText.trim()),
    );
    if (input.maxRefIndex > 0) {
      refined = stripOutOfRangeCitations(refined, input.maxRefIndex);
      const lingering = collectInvalidCitationNumbers(refined, input.maxRefIndex);
      if (lingering.length > 0) {
        refined = stripOutOfRangeCitations(refined, input.maxRefIndex);
      }
    }

    return { draft: refined, charCount: refined.length };
  } finally {
    releaseWritingSlot();
  }
}


export interface AgentWriteSectionInput {
  data: WritingInput;
  context: string;
  dataClaims: EvidenceClaim[];
  globalContext?: WritingGlobalContext;
  userId: string;
  signal: AbortSignal;
}

export interface AgentWriteSectionResult {
  draft: string;
  references: string[];
  verification?: string;
  issueCount: number;
  citationWarnings: number;
  pipelineMode: "fast" | "full";
}

function isAgentWriteAutoFixEnabled(): boolean {
  return process.env.AGENT_WRITE_AUTO_FIX !== "0";
}

function collectWritingEvents(
  events: WritingSSEEvent[],
  pipelineMode: "fast" | "full",
): AgentWriteSectionResult {
  let draft = "";
  let references: string[] = [];
  let verification: string | undefined;
  let citationWarnings = 0;
  let issueCount = 0;

  for (const event of events) {
    if (event.type === "clear_result") {
      draft = "";
      continue;
    }
    if (event.type === "delta") {
      draft += event.content;
      continue;
    }
    if (event.type === "corrected_text") {
      draft = event.text;
      continue;
    }
    if (event.type === "references") {
      references = event.references;
      continue;
    }
    if (event.type === "verification") {
      verification = (verification ?? "") + event.verification;
      continue;
    }
    if (event.type === "review_report") {
      issueCount = event.report.issues.length;
      if (!event.report.passed && event.report.summary) {
        verification = event.report.summary;
      }
      continue;
    }
    if (event.type === "citation_warnings") {
      citationWarnings = event.warnings.length;
    }
  }

  return {
    draft: stripEmbeddedBibliography(draft.trim()),
    references,
    verification,
    issueCount,
    citationWarnings,
    pipelineMode,
  };
}

/** Agent write_section：默认 fast；AGENT_WRITE_AUTO_FIX≠0 时走 full（Verifier+Refiner） */
export async function runAgentWriteSection(
  input: AgentWriteSectionInput & { autoFix?: boolean },
): Promise<AgentWriteSectionResult> {
  if (!tryAcquireWritingSlot()) {
    throw new Error("扩写并发已满，请稍后再试");
  }

  const events: WritingSSEEvent[] = [];
  const emit = (event: WritingSSEEvent) => {
    events.push(event);
    if (event.type === "error") {
      throw new Error(event.error);
    }
  };

  const req = new Request("http://agent-internal/api/writing", {
    signal: input.signal,
  });

  const autoFix =
    input.autoFix !== undefined
      ? input.autoFix
      : isAgentWriteAutoFixEnabled();
  const pipelineMode =
    input.data.mode === "full" || autoFix ? "full" : "fast";

  try {
    await runWritingPipeline({
      req,
      data: { ...input.data, mode: pipelineMode },
      context: input.context,
      dataClaims: input.dataClaims,
      globalContext: input.globalContext,
      userId: input.userId,
      emit,
      finishStream: () => undefined,
    });
  } finally {
    releaseWritingSlot();
  }

  return { ...collectWritingEvents(events, pipelineMode), pipelineMode };
}

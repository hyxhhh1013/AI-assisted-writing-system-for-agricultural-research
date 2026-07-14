import type { WritingSSEEvent } from "@/contracts/sse";
import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingInput } from "@/lib/validations";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";

export type WritingPipelineEmit = (event: WritingSSEEvent) => void;

export interface WritingGlobalContext {
  abstract?: string;
  outline?: string;
  sectionPreviews?: Record<string, string>;
  analysisResults?: string[];
  blueprint?: WritingBlueprint | null;
  /** Phase 3 论证蓝图（已确认时优先注入全局背景） */
  argumentBlueprint?: ArgumentBlueprint | null;
}

export interface PreparedWritingContext {
  systemPrompt: string;
  resolvedSectionPrompt: string;
  contextText: string;
  refRangeHint: string;
  refMapping: Record<string, number>;
  referencesByIndex: string[];
  newSources: string[];
  evidenceSummary: string;
  globalReferenceInfo: string;
  refCount: number;
  dataClaimCount: number;
}

export interface WritingPipelineRunParams {
  req: Request;
  data: WritingInput;
  context: string;
  dataClaims: EvidenceClaim[];
  globalContext: WritingGlobalContext | undefined;
  userId?: string;
  emit: WritingPipelineEmit;
  signal: AbortSignal;
  finishStream: () => void;
}

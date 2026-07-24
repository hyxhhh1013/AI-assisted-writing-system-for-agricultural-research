import type { WritingSSEEvent } from "@/contracts/sse";
import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingInput } from "@/lib/validations";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";

export type WritingPipelineEmit = (event: WritingSSEEvent) => void;

export interface WritingGlobalContext {
  abstract?: string;
  outline?: string;
  sectionPreviews?: Record<string, string>;
  /** 摘要写作：各正文 sec 全文，供综合提炼 */
  sectionBodies?: Record<string, string>;
  analysisResults?: string[];
  blueprint?: WritingBlueprint | null;
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
  /** 有 RAG 全文、允许深度引用的编号；缺省则按 1..refCount */
  groundedRefIndices?: number[];
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

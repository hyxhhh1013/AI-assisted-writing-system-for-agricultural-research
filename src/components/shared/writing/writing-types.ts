import type { PipelineStep } from "@/hooks/use-writing-stream";

export type CitationWarning = { num: number; overlap: number; context: string };

export type DataClaimWarning = {
  claimId: string;
  claimText: string;
  found: boolean;
  citedCorrectly: boolean;
  issue?: string;
};

export type GenerationStatus =
  | "idle"
  | "retrieving"
  | "building_context"
  | "writing"
  | "verifying"
  | "refining"
  | "checking_citations"
  | "generating_figures"
  | "completed";

export interface WritingPreviewPayload {
  content: string;
  pipelineSteps: PipelineStep[];
  verification: string;
  citationWarnings: CitationWarning[];
  dataClaimWarnings: DataClaimWarning[];
  detectedRefs: string[];
  targetSection: string;
  subsectionTitle?: string;
  isStreaming?: boolean;
}

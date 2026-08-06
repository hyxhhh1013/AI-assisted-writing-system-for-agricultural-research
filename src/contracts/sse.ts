/** SSE 事件类型 — 前后端共享的单一契约 */

// --- 基础类型 ---
export interface SSEDeltaEvent { type: "delta"; content: string }
export interface SSEStatusEvent { type: "status"; status: "retrieving" | "building_context" | "writing" | "verifying" | "refining" | "checking_citations" | "generating_figures" | "completed" }
export interface SSEPipelineStepEvent { type: "pipeline_step"; step: string; status: "pending" | "running" | "done" | "error"; detail?: string }
export interface SSEVerificationEvent { type: "verification"; verification: string }
export interface SSEReviewReportEvent {
  type: "review_report";
  report: import("@/contracts/writing-verification").VerificationReport;
}
export interface SSEReferencesEvent { type: "references"; references: string[]; refMapping?: Record<string, number> }
export interface SSECitationWarningsEvent { type: "citation_warnings"; warnings: { num: number; overlap: number; context: string }[] }
export interface SSEDataClaimWarningsEvent { type: "data_claim_warnings"; warnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[] }
export interface SSECorrectedTextEvent { type: "corrected_text"; text: string }
export interface SSEClearResultEvent { type: "clear_result" }
export interface SSEErrorEvent { type: "error"; error: string }
export interface SSEInfoEvent { type: "info"; info: string; refMapping?: Record<string, number> }
export interface SSEBulletDoneEvent {
  type: "bullet_done";
  bulletIndex: number;
  content: string;
  bulletCount: number;
}

/** 写作 SSE 事件联合类型 */
export type WritingSSEEvent =
  | SSEDeltaEvent
  | SSEStatusEvent
  | SSEPipelineStepEvent
  | SSEVerificationEvent
  | SSEReviewReportEvent
  | SSEReferencesEvent
  | SSECitationWarningsEvent
  | SSEDataClaimWarningsEvent
  | SSECorrectedTextEvent
  | SSEClearResultEvent
  | SSEErrorEvent
  | SSEInfoEvent
  | SSEBulletDoneEvent;

/** 通用 SSE 事件（unknown shape） */
export type SSEEvent = Record<string, unknown>;

// --- 类型守卫 ---
export function isDeltaEvent(e: unknown): e is SSEDeltaEvent { return (e as SSEEvent).type === "delta"; }
export function isStatusEvent(e: unknown): e is SSEStatusEvent { return (e as SSEEvent).type === "status"; }
export function isPipelineStepEvent(e: unknown): e is SSEPipelineStepEvent { return (e as SSEEvent).type === "pipeline_step"; }
export function isVerificationEvent(e: unknown): e is SSEVerificationEvent { return (e as SSEEvent).type === "verification"; }
export function isReviewReportEvent(e: unknown): e is SSEReviewReportEvent { return (e as SSEEvent).type === "review_report"; }
export function isReferencesEvent(e: unknown): e is SSEReferencesEvent { return (e as SSEEvent).type === "references"; }
export function isCitationWarningsEvent(e: unknown): e is SSECitationWarningsEvent { return (e as SSEEvent).type === "citation_warnings"; }
export function isDataClaimWarningsEvent(e: unknown): e is SSEDataClaimWarningsEvent { return (e as SSEEvent).type === "data_claim_warnings"; }
export function isCorrectedTextEvent(e: unknown): e is SSECorrectedTextEvent { return (e as SSEEvent).type === "corrected_text"; }
export function isClearResultEvent(e: unknown): e is SSEClearResultEvent { return (e as SSEEvent).type === "clear_result"; }
export function isErrorEvent(e: unknown): e is SSEErrorEvent { return (e as SSEEvent).type === "error"; }
export function isInfoEvent(e: unknown): e is SSEInfoEvent { return (e as SSEEvent).type === "info"; }
export function isBulletDoneEvent(e: unknown): e is SSEBulletDoneEvent { return (e as SSEEvent).type === "bullet_done"; }

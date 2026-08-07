import type { WritingStage } from "@/contracts/agent";

export interface WriteStatus {
  section: string;
  stage: WritingStage | null;
  detail?: string;
  chars: number;
  elapsedMs: number;
  info: string[];
  warnings: string[];
  done?: { chars: number; issueCount: number; passed: boolean; verification?: string };
  error?: string;
}

export interface WriteProgressPayload {
  label: string;
  stage?: WritingStage;
  detail?: string;
  chars?: number;
  elapsedMs?: number;
  info?: string[];
  warnings?: string[];
}

export function initWriteStatus(section: string): WriteStatus {
  return { section, stage: null, chars: 0, elapsedMs: 0, info: [], warnings: [] };
}

export function mergeProgressIntoWriteStatus(
  status: WriteStatus,
  payload: WriteProgressPayload,
): WriteStatus {
  const next: WriteStatus = { ...status, info: [...status.info], warnings: [...status.warnings] };
  if (payload.stage) next.stage = payload.stage;
  if (payload.detail !== undefined) next.detail = payload.detail;
  if (typeof payload.chars === "number") next.chars = payload.chars;
  if (typeof payload.elapsedMs === "number") next.elapsedMs = payload.elapsedMs;
  for (const line of payload.info ?? []) {
    if (!next.info.includes(line)) next.info.push(line);
  }
  for (const line of payload.warnings ?? []) {
    if (!next.warnings.includes(line)) next.warnings.push(line);
  }
  return next;
}

export function finalizeWriteStatus(
  status: WriteStatus,
  result: {
    success: boolean;
    charCount?: number;
    issueCount?: number;
    pipelineMode?: string;
    verification?: string;
    error?: string;
  },
): WriteStatus {
  if (!result.success) {
    return { ...status, stage: "error", error: result.error ?? "写章节失败" };
  }
  return {
    ...status,
    stage: "completed",
    detail: "完成",
    chars: result.charCount ?? status.chars,
    done: {
      chars: result.charCount ?? status.chars,
      issueCount: result.issueCount ?? 0,
      passed: result.pipelineMode !== "full" || (result.issueCount ?? 0) === 0,
      ...(result.verification ? { verification: result.verification } : {}),
    },
  };
}

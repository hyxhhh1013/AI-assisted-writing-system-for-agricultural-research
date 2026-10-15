import { isAgentSessionSnapshot } from "@/contracts/agent-session";
import type { OpsSessionDetail, OpsTraceLine, OpsTranscriptLine } from "@/contracts/ops";

const TRANSCRIPT_TAIL = 12;
const TRACE_TAIL = 24;
const TEXT_CAP = 180;

const OMITTED_PARAM_KEYS = new Set([
  "content",
  "draft",
  "text",
  "bullets",
  "body",
  "markdown",
  "selectedIndices",
  "userConfirmed",
]);

function clip(value: unknown, cap = TEXT_CAP): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > cap ? `${trimmed.slice(0, cap)}…` : trimmed;
}

function shrinkParams(params: unknown): Record<string, string> | undefined {
  if (!params || typeof params !== "object" || Array.isArray(params)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (OMITTED_PARAM_KEYS.has(key)) {
      out[key] = typeof value === "string" ? `${value.length} chars` : "omitted";
      continue;
    }
    if (typeof value === "string") out[key] = value.slice(0, 80);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
    else if (Array.isArray(value)) out[key] = `array:${value.length}`;
    else out[key] = "object";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function toTranscriptLine(message: unknown): OpsTranscriptLine | null {
  if (!message || typeof message !== "object") return null;
  const row = message as Record<string, unknown>;
  const kind = typeof row.kind === "string" ? row.kind : "";
  if (!kind || kind === "thought" || kind === "divider") return null;
  if (kind === "summary") {
    const summary = row.summary;
    const text = summary && typeof summary === "object"
      ? clip((summary as { text?: unknown }).text)
      : undefined;
    return text ? { kind, text } : { kind };
  }
  const line: OpsTranscriptLine = { kind };
  const text = clip(row.text);
  if (text) line.text = text;
  if (typeof row.tool === "string") line.tool = row.tool;
  const params = shrinkParams(row.params);
  if (params) line.params = params;
  const error = clip(row.error);
  if (error) line.error = error;
  if (typeof row.sectionKey === "string") line.sectionKey = row.sectionKey;
  return line;
}

function toTraceLine(item: unknown): OpsTraceLine | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (typeof row.tool !== "string" || typeof row.ok !== "boolean") return null;
  const line: OpsTraceLine = {
    at: typeof row.at === "number" ? row.at : 0,
    tool: row.tool,
    ok: row.ok,
  };
  if (typeof row.via === "string") line.via = row.via;
  const reason = clip(row.reason, 160);
  if (reason) line.reason = reason;
  return line;
}

export interface OpsSessionSource {
  id: string;
  userName?: string;
  projectId: string | null;
  projectTitle: string | null;
  directionSlug: string | null;
  goal: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: unknown;
}

export function viewOpsSession(source: OpsSessionSource): OpsSessionDetail {
  const snap = isAgentSessionSnapshot(source.snapshot) ? source.snapshot : null;
  const transcriptAll = (snap?.uiTranscript ?? [])
    .map(toTranscriptLine)
    .filter((line): line is OpsTranscriptLine => line !== null);
  const traceAll = (snap?.toolTrace ?? [])
    .map(toTraceLine)
    .filter((line): line is OpsTraceLine => line !== null);
  const error = clip(snap?.error, 200) ?? null;
  return {
    id: source.id,
    ...(source.userName ? { userName: source.userName } : {}),
    projectId: source.projectId,
    projectTitle: source.projectTitle,
    directionSlug: source.directionSlug,
    goal: clip(source.goal, 400) ?? "",
    status: source.status,
    errorMessage: clip(source.errorMessage, 200) ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    iteration: snap?.iteration ?? 0,
    toolCallCount: snap?.toolCallCount ?? 0,
    intentKind: snap?.intentKind ?? null,
    error,
    transcript: transcriptAll.slice(-TRANSCRIPT_TAIL),
    transcriptDropped: Math.max(0, transcriptAll.length - TRANSCRIPT_TAIL),
    toolTrace: traceAll.slice(-TRACE_TAIL),
    toolTraceDropped: Math.max(0, traceAll.length - TRACE_TAIL),
  };
}

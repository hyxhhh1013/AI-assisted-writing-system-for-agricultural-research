/**
 * 查重 API 客户端封装（UI → /api/plagiarism/*）
 * 服务端算法见 plagiarism-service.ts
 */

import type {
  PlagiarismCheckDetailRecord,
  PlagiarismCheckRequest,
  PlagiarismCheckResult,
  PlagiarismCheckStreamEvent,
  PlagiarismHistoryItem,
  RewriteMatchRequest,
  RewriteSuggestion,
  RewriteSuggestionUpdateRequest,
} from "@/contracts/plagiarism";

export type {
  CheckResult,
  MatchResult,
  PlagiarismCheckDetailRecord,
  PlagiarismCheckRequest,
  PlagiarismCheckResult,
  PlagiarismCheckStreamEvent,
  PlagiarismHistoryItem,
  PlagiarismMatchResult,
  RewriteMatchRequest,
  RewriteSuggestion,
  RewriteSuggestionUpdateRequest,
} from "@/contracts/plagiarism";

/** POST /api/plagiarism/check — 同步查重 */
export async function checkPlagiarism(
  payload: PlagiarismCheckRequest,
): Promise<PlagiarismCheckResult> {
  const res = await fetch("/api/plagiarism/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "查重失败");
  }
  return res.json() as Promise<PlagiarismCheckResult>;
}

/** POST /api/plagiarism/check — SSE 进度流（供 UI-PR-050 hook 使用） */
export async function checkPlagiarismStream(
  payload: PlagiarismCheckRequest,
  onEvent: (event: PlagiarismCheckStreamEvent) => void,
  signal?: AbortSignal,
): Promise<PlagiarismCheckResult> {
  const res = await fetch("/api/plagiarism/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "查重失败");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("查重响应无内容");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: PlagiarismCheckResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const event = JSON.parse(trimmed.slice(5).trim()) as PlagiarismCheckStreamEvent;
      onEvent(event);
      if (event.type === "done") result = event.data;
      if (event.type === "error") throw new Error(event.message);
    }
  }

  if (!result) throw new Error("查重流意外结束");
  return result;
}

/** GET /api/plagiarism/history — 历史列表 */
export async function listHistory(options?: {
  projectId?: string;
  limit?: number;
}): Promise<PlagiarismHistoryItem[]> {
  const params = new URLSearchParams();
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const res = await fetch(`/api/plagiarism/history${query ? `?${query}` : ""}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "获取查重历史失败");
  }
  const data = (await res.json()) as { checks?: PlagiarismHistoryItem[] };
  return data.checks ?? [];
}

/** GET /api/plagiarism/history?checkId= — 单次查重详情 */
export async function getCheckDetail(checkId: string): Promise<PlagiarismCheckDetailRecord> {
  const res = await fetch(`/api/plagiarism/history?checkId=${encodeURIComponent(checkId)}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "获取查重详情失败");
  }
  const data = (await res.json()) as { check?: PlagiarismCheckDetailRecord };
  if (!data.check) throw new Error("查重记录不存在");
  return data.check;
}

/** 将详情记录转为 UI 用的 CheckResult */
export function toCheckResult(detail: PlagiarismCheckDetailRecord): PlagiarismCheckResult {
  return {
    checkId: detail.id,
    totalMatches: detail._count?.matches ?? detail.matches.length,
    maxSimilarity: detail.maxSimilarity ?? 0,
    overallRisk: (detail.overallRisk || "low") as PlagiarismCheckResult["overallRisk"],
    matches: detail.matches,
  };
}

/** POST /api/plagiarism/rewrite — 生成降重建议 */
export async function rewriteMatch(
  payload: RewriteMatchRequest,
): Promise<RewriteSuggestion[]> {
  const res = await fetch("/api/plagiarism/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "生成改写建议失败");
  }
  const data = (await res.json()) as { suggestions?: RewriteSuggestion[] };
  return data.suggestions ?? [];
}

/** PATCH /api/plagiarism/rewrite — 采纳/忽略改写建议 */
export async function updateRewriteSuggestion(
  payload: RewriteSuggestionUpdateRequest,
): Promise<void> {
  const res = await fetch("/api/plagiarism/rewrite", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "更新改写建议失败");
  }
}

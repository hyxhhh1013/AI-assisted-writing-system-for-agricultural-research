/**
 * 引用硬检 API 客户端（W3-CITE-GATE）
 */

import type { CitationGateResult } from "@/contracts/citation-gate";

export async function runCitationGate(input: {
  projectId?: string;
  texts?: string[];
  refCount?: number;
}): Promise<CitationGateResult> {
  const res = await fetch("/api/citations/gate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    gate?: CitationGateResult;
  };
  if (!res.ok || !data.success || !data.gate) {
    throw new Error(data.error || "引用硬检失败");
  }
  return data.gate;
}

export async function getCitationGateStatus(
  projectId: string,
): Promise<CitationGateResult> {
  const res = await fetch(
    `/api/citations/gate?projectId=${encodeURIComponent(projectId)}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    gate?: CitationGateResult;
  };
  if (!res.ok || !data.success || !data.gate) {
    throw new Error(data.error || "获取引用硬检状态失败");
  }
  return data.gate;
}

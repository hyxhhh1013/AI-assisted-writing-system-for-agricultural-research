/** POST /api/writing — 写作 SSE（由 hook 解析事件） */

import type { WritingRequest } from "@/contracts/writing";

/** 发起写作流式请求，返回原始 Response 供 hook 消费 SSE */
export async function postWritingStream(
  request: WritingRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch("/api/writing", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error("写作请求失败");
  return res;
}

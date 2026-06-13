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
  if (!res.ok) {
    let message = "写作请求失败";
    try {
      const body = (await res.json()) as {
        error?: string;
        details?: Record<string, string[]>;
      };
      const detailMessages = body.details ? Object.values(body.details).flat() : [];
      if (detailMessages.length > 0) {
        message = detailMessages.join("；");
      } else if (body.error) {
        message = body.error;
      }
    } catch {
      /* 非 JSON 响应，保留默认提示 */
    }
    throw new Error(message);
  }
  return res;
}

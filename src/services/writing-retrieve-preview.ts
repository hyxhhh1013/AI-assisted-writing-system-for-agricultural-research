/** POST /api/writing/retrieve-preview — 扩写前 RAG 命中预览 */

import type { RetrievePreviewRequest, RetrievePreviewResponse } from "@/contracts/writing-retrieve-preview";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

export async function postWritingRetrievePreview(
  request: RetrievePreviewRequest,
  signal?: AbortSignal,
): Promise<RetrievePreviewResponse> {
  const res = await fetch("/api/writing/retrieve-preview", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = (await res.json()) as ApiSuccess<RetrievePreviewResponse> | ApiError;

  if (!res.ok || !body.success) {
    const message = "success" in body && body.success === false ? body.error : "文献检索预览失败";
    throw new Error(message);
  }

  return body.data;
}

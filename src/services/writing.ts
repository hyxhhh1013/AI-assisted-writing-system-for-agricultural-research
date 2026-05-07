/** 写作 API 类型定义与服务封装 */

export interface WritingRequest {
  title: string;
  section: string;
  context: string;
  language?: string;
  template?: string;
  existingReferences?: string[];
  researchDirection?: string;
  retrievalMode?: string;
  globalContext?: {
    abstract?: string;
    outline?: string;
    sectionPreviews?: { key: string; content: string }[];
    analysisResults?: string[];
  };
}

export interface RagChunk {
  content: string;
  metadata: {
    source: string;
    category: string;
    id: string;
    pageStart?: number;
    pageEnd?: number;
    chunkIndex?: number;
  };
}

export interface OutlineRequest {
  title: string;
  researchDirection: string;
  language?: string;
}

export async function generateWriting(request: WritingRequest, signal?: AbortSignal): Promise<Response> {
  const res = await fetch("/api/writing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) throw new Error("写作请求失败");
  return res;
}

export async function generateOutline(request: OutlineRequest, signal?: AbortSignal): Promise<Response> {
  const res = await fetch("/api/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) throw new Error("大纲生成失败");
  return res;
}

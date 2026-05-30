/** 知识库 API 类型定义与服务封装 */

import type { ReindexProgressEvent } from "@/contracts/reindex";

export interface KnowledgeFile {
  name: string;
  path?: string;
  category: string;
  documentType?: string; // "paper" | "patent" | "other"
  chunkCount: number;
  size: number;
  mtime: string;
  _snippets?: string[];
}

export interface KnowledgeSearchParams {
  q?: string;
  category?: string;
  type?: "name" | "semantic";
  page?: number;
  pageSize?: number;
}

export interface KnowledgeSearchResult {
  files: KnowledgeFile[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  searchType: string;
}

export async function searchKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeSearchResult> {
  const url = new URLSearchParams();
  if (params.q) url.append("q", params.q);
  if (params.category) url.append("category", params.category);
  if (params.type) url.append("type", params.type);
  if (params.page) url.append("page", String(params.page));
  if (params.pageSize) url.append("pageSize", String(params.pageSize));
  const res = await fetch(`/api/knowledge?${url.toString()}`);
  if (!res.ok) throw new Error("知识库请求失败");
  return res.json();
}

export async function reindexKnowledge(): Promise<string> {
  let message = "索引更新成功";
  await reindexKnowledgeStream((event) => {
    if (event.type === "complete") {
      message = `索引完成：${event.fileCount} 篇文献，${event.totalChunks} 个文本块`;
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }
  });
  return message;
}

/** SSE 流式重建索引，实时推送进度 */
export async function reindexKnowledgeStream(
  onEvent: (event: ReindexProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/knowledge/reindex", { method: "POST", signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "索引请求失败");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("索引响应无内容");

  const decoder = new TextDecoder();
  let buffer = "";
  let sawComplete = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data:")) continue;

      const event = JSON.parse(trimmed.slice(5).trim()) as ReindexProgressEvent;
      onEvent(event);

      if (event.type === "complete") sawComplete = true;
      if (event.type === "error") throw new Error(event.message);
    }
  }

  if (!sawComplete) {
    throw new Error("索引流意外结束");
  }
}

export async function uploadKnowledgeFile(file: File, category: string, documentType?: string): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (documentType) formData.append("documentType", documentType);
  const res = await fetch("/api/knowledge", { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "上传失败");
  }
}

export async function updateFileCategory(name: string, oldCategory: string, newCategory: string): Promise<void> {
  const res = await fetch("/api/knowledge", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, oldCategory, newCategory }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "分类更新失败");
  }
}

export async function batchMoveFiles(files: { name: string; category: string }[], newCategory: string): Promise<string> {
  const res = await fetch("/api/knowledge", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "batch_move", files, newCategory }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "批量移动失败");
  return data.message;
}

export async function deleteKnowledgeFile(name: string): Promise<void> {
  const res = await fetch(`/api/knowledge?name=${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "删除失败");
  }
}

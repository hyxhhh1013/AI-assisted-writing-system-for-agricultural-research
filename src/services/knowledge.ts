/** 知识库 API 类型定义与服务封装 */

export interface KnowledgeFile {
  name: string;
  category: string;
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
  const res = await fetch("/api/knowledge?action=reindex", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "索引失败");
  return data.message;
}

export async function uploadKnowledgeFile(file: File, category: string): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
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

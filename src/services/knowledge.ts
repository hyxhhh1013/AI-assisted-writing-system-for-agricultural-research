/** 知识库 API 服务封装 */

import type {
  BibliographyImportCommitItem,
  BibliographyImportPreviewResponse,
  BibliographyImportResult,
} from "@/contracts/bib-import";
import type {
  KnowledgeFileRecord,
  KnowledgeMetadataPatch,
  KnowledgeSearchParams,
  KnowledgeSearchResult,
} from "@/contracts/knowledge";
import type {
  KnowledgeAnalyzeMeta,
  KnowledgeAnalyzeProgress,
  KnowledgeAnalyzeRequest,
  KnowledgeAnalyzeResult,
} from "@/contracts/knowledge-analyze";
import { parseAnalyzeMeta } from "@/contracts/knowledge-analyze";
import type { ReindexProgressEvent, ReindexRequest } from "@/contracts/reindex";

export type {
  KnowledgeAnalyzeMeta,
  KnowledgeAnalyzeProgress,
  KnowledgeAnalyzeRequest,
  KnowledgeAnalyzeResult,
};
export type { KnowledgeFileRecord as KnowledgeFile, KnowledgeSearchParams, KnowledgeSearchResult };

/** GET /api/knowledge — 获取知识库文件列表 */
export async function listKnowledgeFiles(): Promise<{ files: KnowledgeFileRecord[]; categories: string[] }> {
  const res = await fetch("/api/knowledge");
  if (!res.ok) throw new Error("获取文献列表失败");
  return res.json();
}

export async function searchKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeSearchResult> {
  const url = new URLSearchParams();
  if (params.q) url.append("q", params.q);
  if (params.category) url.append("category", params.category);
  if (params.type) url.append("type", params.type);
  if (params.page) url.append("page", String(params.page));
  if (params.pageSize) url.append("pageSize", String(params.pageSize));
  const res = await fetch(`/api/knowledge?${url.toString()}`);
  const data = await res.json().catch(() => ({})) as KnowledgeSearchResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || (res.status === 503 ? "语义检索暂时不可用" : "知识库请求失败"));
  }
  return data;
}

export type ReindexKnowledgeOptions = ReindexRequest;

export async function reindexKnowledge(options?: ReindexKnowledgeOptions): Promise<string> {
  let message = "索引更新成功";
  await reindexKnowledgeStream((event) => {
    if (event.type === "complete") {
      message = `索引完成：${event.fileCount} 篇文献，${event.totalChunks} 个文本块`;
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }
  }, undefined, options);
  return message;
}

/** SSE 流式重建索引，实时推送进度。支持断线自动重连（最多 15 次，每次等待 3 秒） */
export async function reindexKnowledgeStream(
  onEvent: (event: ReindexProgressEvent) => void,
  signal?: AbortSignal,
  options?: ReindexKnowledgeOptions,
): Promise<void> {
  const hasBody =
    options &&
    ((options.files && options.files.length > 0) ||
      options.forceStage1 === true ||
      options.forceStage3 === true);

  const MAX_RETRIES = 15;
  let eventCount = 0;
  let sawComplete = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const headers: Record<string, string> = {};
      if (hasBody) headers["Content-Type"] = "application/json";
      // 断线重连时传递已收到的事件数，后端只发送新事件
      if (eventCount > 0) headers["x-reindex-cursor"] = String(eventCount);

      const res = await fetch("/api/knowledge/reindex", {
        method: "POST",
        headers,
        body: hasBody ? JSON.stringify(options) : undefined,
        signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "索引请求失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("索引响应无内容");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          throw new DOMException("Aborted", "AbortError");
        }
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
          eventCount++;

          if (event.type === "complete") sawComplete = true;
          if (event.type === "error") throw new Error(event.message);
        }
      }

      if (sawComplete) return;
      // 流意外结束但没有 complete → 可能是后端还在跑，重试
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        throw new DOMException("Aborted", "AbortError");
      }
      // 网络错误等 → 等待后重连
      if (attempt < MAX_RETRIES - 1 && !sawComplete) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }

  if (!sawComplete) {
    throw new Error("索引流意外结束（已重试多次）");
  }
}

/** 流式 AI 文献分析（精读/摘要），返回 DeepSeek 原始文本流 */
export async function analyzeKnowledgeStream(
  params: KnowledgeAnalyzeRequest,
  onProgress: (progress: KnowledgeAnalyzeProgress) => void,
  signal?: AbortSignal,
): Promise<KnowledgeAnalyzeResult> {
  const res = await fetch("/api/knowledge/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "文献分析请求失败");
  }

  const meta = parseAnalyzeMeta(res.headers);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("分析响应无内容");

  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onProgress({ meta, text, done: false });
  }

  text += decoder.decode();
  onProgress({ meta, text, done: true });
  return { meta, text };
}

export async function uploadKnowledgeFile(file: File, category: string, documentType?: string): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (documentType) formData.append("documentType", documentType);
  const res = await fetch("/api/knowledge", { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "上传失败");
  }
}

export async function updateFileCategory(
  name: string,
  oldCategory: string,
  newCategory: string,
  documentType?: string,
): Promise<void> {
  const res = await fetch("/api/knowledge", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, oldCategory, newCategory, documentType }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "分类更新失败");
  }
}

export async function updateKnowledgeMetadata(payload: KnowledgeMetadataPatch): Promise<void> {
  const res = await fetch("/api/knowledge", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update_metadata", ...payload }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "书目更新失败");
  }
}

export async function batchMoveFiles(files: { name: string; category: string }[], newCategory: string): Promise<string> {
  const res = await fetch("/api/knowledge", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "batch_move", files, newCategory }),
  });
  const data = await res.json() as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error || "批量移动失败");
  return data.message || "批量移动完成";
}

export async function deleteKnowledgeFile(name: string, category: string): Promise<void> {
  const res = await fetch(
    `/api/knowledge?name=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "删除失败");
  }
}

/** POST /api/knowledge/import-bibliography — 预览 RIS/BibTeX 导入 */
export async function previewBibliographyImport(
  file: File,
  category: string,
): Promise<BibliographyImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  formData.append("dryRun", "true");
  const res = await fetch("/api/knowledge/import-bibliography", { method: "POST", body: formData });
  const data = await res.json() as BibliographyImportPreviewResponse & { error?: string };
  if (!res.ok) throw new Error(data.error || "书目预览失败");
  return data;
}

/** POST /api/knowledge/import-bibliography — 确认写入 Prisma */
export async function commitBibliographyImport(
  category: string,
  items: BibliographyImportCommitItem[],
): Promise<BibliographyImportResult & { message?: string }> {
  const res = await fetch("/api/knowledge/import-bibliography", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, items }),
  });
  const data = await res.json() as BibliographyImportResult & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error || "书目导入失败");
  return data;
}

export async function batchDeleteKnowledgeFiles(files: { name: string; category: string }[]): Promise<string> {
  const res = await fetch("/api/knowledge?batch=true", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const data = await res.json() as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error || "批量删除失败");
  return data.message || "删除完成";
}

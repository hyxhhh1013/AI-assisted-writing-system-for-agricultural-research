/** 知识库文献 AI 分析 — 前后端共享契约 */

export type AnalyzeMode = "chunk" | "full";

export interface KnowledgeAnalyzeRequest {
  filename: string;
  mode?: AnalyzeMode;
  chunkIndex?: number;
}

export interface KnowledgeAnalyzeMeta {
  mode: AnalyzeMode;
  totalChunks: number;
  currentChunk: number;
}

export interface KnowledgeAnalyzeResult {
  meta: KnowledgeAnalyzeMeta;
  text: string;
}

export interface KnowledgeAnalyzeProgress {
  meta: KnowledgeAnalyzeMeta;
  /** 当前已累积的全文 */
  text: string;
  done: boolean;
}

export function parseAnalyzeMeta(headers: Headers): KnowledgeAnalyzeMeta {
  const mode = headers.get("X-Analysis-Mode");
  return {
    mode: mode === "full" ? "full" : "chunk",
    totalChunks: Number(headers.get("X-Total-Chunks") || "1"),
    currentChunk: Number(headers.get("X-Current-Chunk") || "0"),
  };
}

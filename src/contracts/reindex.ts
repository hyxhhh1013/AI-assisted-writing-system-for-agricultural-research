/** 知识库重建索引 SSE 事件 — 前后端共享 */

export interface ReindexStartedEvent {
  type: "started";
}

export interface ReindexScanEvent {
  type: "scan";
  total: number;
  unchanged: number;
  changed: number;
  duplicatesSkipped?: number;
  pathsFound?: number;
}

export interface ReindexFileEvent {
  type: "file";
  status: "processing" | "unchanged" | "done" | "error";
  name: string;
  index: number;
  total: number;
  chunkCount?: number;
  documentType?: string;
  message?: string;
}

export interface ReindexPhaseEvent {
  type: "phase";
  phase: "pdf_done" | "embed_skip" | "writing";
  detail?: string;
  chunkCount?: number;
  pendingEmbeddings?: number;
}

export interface ReindexEmbedEvent {
  type: "embed";
  current: number;
  total: number;
  chunkCount: number;
}

export interface ReindexSaveEvent {
  type: "save";
  phase: "main" | "category";
  category?: string;
  chunkCount: number;
}

export interface ReindexCompleteEvent {
  type: "complete";
  totalChunks: number;
  fileCount: number;
  categoryCount: number;
  duplicatesSkipped?: number;
}

export interface ReindexErrorEvent {
  type: "error";
  message: string;
}

export type ReindexProgressEvent =
  | ReindexStartedEvent
  | ReindexScanEvent
  | ReindexFileEvent
  | ReindexPhaseEvent
  | ReindexEmbedEvent
  | ReindexSaveEvent
  | ReindexCompleteEvent
  | ReindexErrorEvent;

export interface ReindexProgressState {
  phase: string;
  percent: number;
  currentFile: string;
  processedFiles: number;
  totalFiles: number;
  unchangedCount: number;
  changedCount: number;
  logs: string[];
}

export const INITIAL_REINDEX_PROGRESS: ReindexProgressState = {
  phase: "",
  percent: 0,
  currentFile: "",
  processedFiles: 0,
  totalFiles: 0,
  unchangedCount: 0,
  changedCount: 0,
  logs: [],
};

export function applyReindexEvent(
  prev: ReindexProgressState,
  event: ReindexProgressEvent,
): ReindexProgressState {
  switch (event.type) {
    case "started":
      return { ...INITIAL_REINDEX_PROGRESS, phase: "启动索引任务", percent: 1 };

    case "scan":
      return {
        ...prev,
        phase: "扫描文献目录",
        totalFiles: event.total,
        unchangedCount: event.unchanged,
        changedCount: event.changed,
        percent: 5,
        logs: appendLog(
          prev.logs,
          event.duplicatesSkipped
            ? `扫描 ${event.pathsFound ?? event.total} 个路径 → ${event.total} 篇唯一文献（跳过 ${event.duplicatesSkipped} 个重复路径），${event.changed} 篇需更新`
            : `共 ${event.total} 个 PDF，${event.changed} 个需更新，${event.unchanged} 个可复用`,
        ),
      };

    case "file": {
      // PDF 解析阶段占 5%–55%（避免在最后一篇时长期停在 70% 造成“卡死”错觉）
      const filePercent =
        event.total > 0 ? 5 + Math.round((event.index / event.total) * 50) : prev.percent;
      if (event.status === "processing") {
        const processingPercent =
          event.total > 0
            ? 5 + Math.round(((event.index - 1) / event.total) * 50)
            : prev.percent;
        return {
          ...prev,
          phase:
            event.index === event.total
              ? "解析 PDF（最后一篇，完成后进入向量化/写入）"
              : "解析 PDF",
          currentFile: event.name,
          processedFiles: Math.max(0, event.index - 1),
          totalFiles: event.total,
          percent: Math.max(prev.percent, processingPercent),
        };
      }
      if (event.status === "unchanged") {
        return {
          ...prev,
          processedFiles: event.index,
          totalFiles: event.total,
          percent: Math.max(prev.percent, filePercent),
          logs: appendLog(prev.logs, `跳过（未变更）: ${event.name}`),
        };
      }
      if (event.status === "done") {
        return {
          ...prev,
          processedFiles: event.index,
          totalFiles: event.total,
          percent: Math.max(prev.percent, filePercent),
          currentFile: event.index === event.total ? "" : prev.currentFile,
          logs: appendLog(
            prev.logs,
            `完成: ${event.name}${event.chunkCount != null ? ` · ${event.chunkCount} 块` : ""}`,
          ),
        };
      }
      return {
        ...prev,
        logs: appendLog(prev.logs, `失败: ${event.name} — ${event.message || "未知错误"}`),
      };
    }

    case "phase":
      if (event.phase === "pdf_done") {
        return {
          ...prev,
          phase: "PDF 解析完成",
          currentFile: "",
          percent: 56,
          logs: appendLog(
            prev.logs,
            `PDF 阶段完成：${event.chunkCount ?? 0} 个文本块${
              event.pendingEmbeddings
                ? `，待向量化 ${event.pendingEmbeddings} 块`
                : "，无需向量化"
            }`,
          ),
        };
      }
      if (event.phase === "embed_skip") {
        return {
          ...prev,
          phase: "跳过向量化",
          percent: Math.max(prev.percent, 56),
          logs: appendLog(prev.logs, event.detail || "未配置 API Key，语义检索将使用 BM25"),
        };
      }
      return {
        ...prev,
        phase: "写入索引文件",
        percent: Math.max(prev.percent, 85),
        logs: appendLog(prev.logs, event.detail || "正在保存 index.json…"),
      };

    case "embed":
      return {
        ...prev,
        phase: "向量化嵌入",
        currentFile: "",
        percent: 56 + Math.round((event.current / Math.max(event.total, 1)) * 29),
        logs: appendLog(prev.logs, `嵌入批次 ${event.current}/${event.total}（${event.chunkCount} 块）`),
      };

    case "save":
      return {
        ...prev,
        phase: event.phase === "main" ? "写入主索引" : `写入分类索引 · ${event.category}`,
        percent: event.phase === "main" ? 88 : Math.min(98, 88 + Math.round(prev.percent - 85)),
        logs: appendLog(
          prev.logs,
          event.phase === "main"
            ? `保存主索引（${event.chunkCount} 块）`
            : `保存 index_${event.category}.json（${event.chunkCount} 块）`,
        ),
      };

    case "complete":
      return {
        ...prev,
        phase: "索引构建完成",
        percent: 100,
        processedFiles: event.fileCount,
        totalFiles: event.fileCount,
        logs: appendLog(
          prev.logs,
          `全部完成：${event.fileCount} 篇文献，${event.totalChunks} 个文本块，${event.categoryCount} 个分类`,
        ),
      };

    case "error":
      return {
        ...prev,
        phase: "索引失败",
        logs: appendLog(prev.logs, event.message),
      };

    default:
      return prev;
  }
}

function appendLog(logs: string[], line: string): string[] {
  return [...logs.slice(-7), line];
}

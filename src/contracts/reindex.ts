/** 知识库重建索引 SSE 事件 — 前后端共享 */

/** POST /api/knowledge/reindex 请求体 */
export interface ReindexRequest {
  /** 仅处理这些 PDF 文件名（basename）；省略则全库 */
  files?: string[];
  /** 强制重解析 PDF（Stage 1） */
  forceStage1?: boolean;
  /** 强制重算 embedding（Stage 3） */
  forceStage3?: boolean;
  /** 把旧切块 schema 当 cache miss（IMRaD 重切，对应脚本 --rechunk） */
  rechunk?: boolean;
}

export type KnowledgeIndexJobId = "incremental" | "rechunk" | "forceParse" | "forceEmbed";

export interface KnowledgeIndexJob {
  id: KnowledgeIndexJobId;
  label: string;
  description: string;
  startMessage: string;
  request: ReindexRequest;
  needsConfirm: boolean;
  confirmTitle: string;
  confirmBody: string;
  destructive?: boolean;
}

/** 命令行 --files 上限，避免 Windows 8191 字符限制 */
export const KNOWLEDGE_INDEX_NAMED_FILE_CAP = 80;

export const KNOWLEDGE_INDEX_JOBS: KnowledgeIndexJob[] = [
  {
    id: "incremental",
    label: "更新索引",
    description: "只处理新增或改过的 PDF，未改动的跳过。日常用这个。",
    startMessage: "正在增量更新索引（跳过未改动的文献）…",
    request: {},
    needsConfirm: false,
    confirmTitle: "",
    confirmBody: "",
  },
  {
    id: "rechunk",
    label: "按章节重切块",
    description: "给尚未标注 Introduction/Methods/Results 的文献重切并重算向量，写作才能按节取证。",
    startMessage: "正在按 IMRaD 章节重切块…",
    request: { rechunk: true },
    needsConfirm: true,
    confirmTitle: "按章节重切块？",
    confirmBody:
      "会重解析仍使用旧切块规则的文献（chunk id 会变，这些篇需要重算向量）。已是新规则且 PDF 未改动的会跳过。库很大时建议先勾选若干篇，用工具栏「索引所选」。",
  },
  {
    id: "forceParse",
    label: "强制重解析 PDF",
    description: "忽略缓存，重新抽文本、切块并同步书目。扫描版/切块异常时用。",
    startMessage: "正在强制重解析 PDF…",
    request: { forceStage1: true },
    needsConfirm: true,
    destructive: true,
    confirmTitle: "强制重解析全部 PDF？",
    confirmBody:
      "会忽略 Stage 1 缓存，重新解析范围内每一篇 PDF。耗时长，且切块 id 变化后需要重算向量。日常更新请用「更新索引」。",
  },
  {
    id: "forceEmbed",
    label: "仅重算向量",
    description: "不重新解析 PDF，只重算 embedding。换了向量模型或语义检索失效时用。",
    startMessage: "正在重算向量…",
    request: { forceStage3: true },
    needsConfirm: true,
    confirmTitle: "重算范围内全部向量？",
    confirmBody: "不重新解析 PDF，只对范围内文献重调 embedding API。没有 Key 时这一步会被跳过。",
  },
];

export function getKnowledgeIndexJob(id: KnowledgeIndexJobId): KnowledgeIndexJob {
  const job = KNOWLEDGE_INDEX_JOBS.find((item) => item.id === id);
  if (!job) return KNOWLEDGE_INDEX_JOBS[0];
  return job;
}

export function buildKnowledgeIndexRequest(
  jobId: KnowledgeIndexJobId,
  files?: string[],
): { request: ReindexRequest; error?: string } {
  const job = getKnowledgeIndexJob(jobId);
  const named = (files || []).map((name) => name.trim()).filter(Boolean);
  if (named.length > KNOWLEDGE_INDEX_NAMED_FILE_CAP) {
    return {
      request: job.request,
      error: `一次按文件名索引最多 ${KNOWLEDGE_INDEX_NAMED_FILE_CAP} 篇。请缩小选择，或用页头任务处理全库。`,
    };
  }
  return {
    request: named.length > 0 ? { ...job.request, files: named } : { ...job.request },
  };
}

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
  phase: "pdf_done" | "embed_skip" | "writing" | "sync" | "parse";
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

export type ReindexPipelineStage = "idle" | "scan" | "parse" | "write" | "embed" | "done";

export const REINDEX_PIPELINE_STEPS = [
  { id: "parse", label: "解析 PDF", hint: "抽文本、切块" },
  { id: "write", label: "写入索引", hint: "过滤并落盘" },
  { id: "embed", label: "向量化", hint: "语义检索" },
] as const;

export interface ReindexProgressState {
  phase: string;
  percent: number;
  currentFile: string;
  processedFiles: number;
  totalFiles: number;
  unchangedCount: number;
  changedCount: number;
  logs: string[];
  pipelineStage: ReindexPipelineStage;
  embedCurrent: number;
  embedTotal: number;
  embedSkipped: boolean;
  errorMessage: string;
  failed: boolean;
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
  pipelineStage: "idle",
  embedCurrent: 0,
  embedTotal: 0,
  embedSkipped: false,
  errorMessage: "",
  failed: false,
};

function bumpPercent(prev: number, next: number): number {
  return Math.max(prev, Math.min(100, next));
}

export function applyReindexEvent(
  prev: ReindexProgressState,
  event: ReindexProgressEvent,
): ReindexProgressState {
  switch (event.type) {
    case "started":
      return { ...INITIAL_REINDEX_PROGRESS, phase: "启动索引任务", percent: 1, pipelineStage: "scan" };

    case "scan":
      return {
        ...prev,
        pipelineStage: "scan",
        phase: "扫描文献目录",
        totalFiles: event.total,
        unchangedCount: event.unchanged,
        changedCount: event.changed,
        percent: bumpPercent(prev.percent, 4),
        logs: appendLog(
          prev.logs,
          event.duplicatesSkipped
            ? `扫描 ${event.pathsFound ?? event.total} 个路径 → ${event.total} 篇唯一文献（跳过 ${event.duplicatesSkipped} 个重复路径），${event.changed} 篇需更新`
            : `共 ${event.total} 个 PDF，${event.changed} 个需更新，${event.unchanged} 个可复用`,
        ),
      };

    case "file": {
      const filePercent =
        event.total > 0 ? 4 + Math.round((event.index / event.total) * 44) : prev.percent;
      if (event.status === "processing") {
        const processingPercent =
          event.total > 0
            ? 4 + Math.round(((event.index - 1) / event.total) * 44)
            : prev.percent;
        return {
          ...prev,
          pipelineStage: "parse",
          phase:
            event.index === event.total
              ? "解析 PDF（最后一篇）"
              : "解析 PDF",
          currentFile: event.name,
          processedFiles: Math.max(0, event.index - 1),
          totalFiles: event.total,
          percent: bumpPercent(prev.percent, processingPercent),
        };
      }
      if (event.status === "unchanged") {
        return {
          ...prev,
          pipelineStage: prev.pipelineStage === "scan" ? "parse" : prev.pipelineStage,
          processedFiles: event.index,
          totalFiles: event.total,
          percent: bumpPercent(prev.percent, filePercent),
        };
      }
      if (event.status === "done") {
        return {
          ...prev,
          pipelineStage: "parse",
          processedFiles: event.index,
          totalFiles: event.total,
          percent: bumpPercent(prev.percent, filePercent),
          currentFile: event.index === event.total ? "" : prev.currentFile,
          logs: appendLog(
            prev.logs,
            `完成: ${event.name}${event.chunkCount != null ? ` · ${event.chunkCount} 块` : ""}`,
          ),
        };
      }
      return {
        ...prev,
        pipelineStage: "parse",
        logs: appendLog(prev.logs, `失败: ${event.name} — ${event.message || "未知错误"}`),
      };
    }

    case "phase":
      if (event.phase === "parse") {
        return {
          ...prev,
          pipelineStage: "parse",
          phase: event.detail || "解析 PDF",
          percent: bumpPercent(prev.percent, 4),
        };
      }
      if (event.phase === "pdf_done") {
        return {
          ...prev,
          pipelineStage: "write",
          phase: "PDF 解析完成，开始写入索引",
          currentFile: "",
          percent: bumpPercent(prev.percent, 50),
          logs: appendLog(
            prev.logs,
            `PDF 阶段完成：${event.chunkCount ?? 0} 个文本块${
              event.pendingEmbeddings
                ? `，待向量化 ${event.pendingEmbeddings} 块`
                : ""
            }`,
          ),
        };
      }
      if (event.phase === "embed_skip") {
        return {
          ...prev,
          pipelineStage: "embed",
          embedSkipped: true,
          phase: "跳过向量化",
          percent: bumpPercent(prev.percent, 92),
          logs: appendLog(prev.logs, event.detail || "未配置 API Key，语义检索将使用 BM25"),
        };
      }
      if (event.phase === "sync") {
        return {
          ...prev,
          pipelineStage: "write",
          phase: "同步书目到数据库",
          percent: bumpPercent(prev.percent, 62),
          logs: appendLog(prev.logs, event.detail || "正在写入 Prisma…"),
        };
      }
      return {
        ...prev,
        pipelineStage: "write",
        phase: "写入索引文件",
        percent: bumpPercent(prev.percent, 52),
        logs: appendLog(prev.logs, event.detail || "正在保存分类索引…"),
      };

    case "embed": {
      const ratio = event.current / Math.max(event.total, 1);
      const embedPercent = 64 + Math.round(ratio * 32);
      return {
        ...prev,
        pipelineStage: "embed",
        phase: event.current === 0 ? "准备向量化" : "向量化嵌入",
        currentFile: "",
        embedCurrent: event.current,
        embedTotal: event.total,
        percent: bumpPercent(prev.percent, embedPercent),
        logs: appendLog(
          prev.logs,
          event.current === 0
            ? `待嵌入 ${event.chunkCount} 块 · ${event.total} 批`
            : `嵌入批次 ${event.current}/${event.total}（${event.chunkCount} 块）`,
        ),
      };
    }

    case "save":
      return {
        ...prev,
        pipelineStage: "write",
        phase: event.phase === "main" ? "写入主索引" : `写入分类索引 · ${event.category ?? ""}`,
        percent: bumpPercent(prev.percent, Math.min(62, prev.percent + 2)),
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
        pipelineStage: "done",
        phase: "索引构建完成",
        percent: 100,
        processedFiles: event.fileCount,
        totalFiles: event.fileCount,
        currentFile: "",
        errorMessage: "",
        failed: false,
        logs: appendLog(
          prev.logs,
          `全部完成：${event.fileCount} 篇文献，${event.totalChunks} 个文本块，${event.categoryCount} 个分类`,
        ),
      };

    case "error":
      return {
        ...prev,
        failed: true,
        phase: "索引失败",
        errorMessage: event.message,
        logs: appendLog(prev.logs, event.message),
      };

    default:
      return prev;
  }
}

export function applyReindexDisconnect(prev: ReindexProgressState, message: string): ReindexProgressState {
  if (prev.pipelineStage === "done" || prev.pipelineStage === "idle") return prev;
  return {
    ...prev,
    failed: true,
    phase: "进度连接中断",
    errorMessage: message,
    logs: appendLog(prev.logs, message),
  };
}

function appendLog(logs: string[], line: string): string[] {
  return [...logs.slice(-12), line];
}

export function reindexStepStatus(
  stepId: (typeof REINDEX_PIPELINE_STEPS)[number]["id"],
  state: ReindexProgressState,
): "done" | "current" | "pending" | "error" | "skipped" {
  const order = { parse: 0, write: 1, embed: 2 };
  if (state.pipelineStage === "done") {
    if (stepId === "embed" && state.embedSkipped) return "skipped";
    return "done";
  }
  if (state.pipelineStage === "idle" || state.pipelineStage === "scan") {
    return stepId === "parse" ? (state.failed ? "error" : "current") : "pending";
  }
  const current = currentStepId(state.pipelineStage);
  const si = order[stepId];
  const ci = order[current];
  if (state.failed) {
    if (si === ci) return "error";
    return si < ci ? "done" : "pending";
  }
  if (stepId === "embed" && state.embedSkipped && si === ci) return "skipped";
  if (si < ci) return "done";
  if (si === ci) return "current";
  return "pending";
}

function currentStepId(stage: ReindexPipelineStage): (typeof REINDEX_PIPELINE_STEPS)[number]["id"] {
  if (stage === "write") return "write";
  if (stage === "embed" || stage === "done") return "embed";
  return "parse";
}

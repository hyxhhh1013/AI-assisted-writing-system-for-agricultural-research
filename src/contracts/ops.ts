/**
 * 线上只读运维接口（/api/ops）。给本机 MCP 用，不进工作台。
 * 响应里没有密钥、章节正文和完整快照。
 */

export interface OpsHealth {
  db: { connected: boolean; provider: string; sizeBytes: number };
  server: {
    uptimeSec: number;
    nodeVersion: string;
    memoryMB: number;
    heapUsedMB: number;
    heapLimitMB: number;
    heapPct: number;
    pm2: {
      name: string;
      status: string;
      restarts: number;
      unstableRestarts: number;
      memoryMB: number;
    } | null;
  };
  ai: {
    providers: { provider: string; name: string; keyCount: number; model: string }[];
    missingKeyProviders: string[];
  };
  agent: {
    totalSessions: number;
    errorSessions: number;
    errorSessions24h: number;
    runningSessions: number;
  };
  knowledge: { fileCount: number; chunkCount: number };
  index: { fileCount: number; totalSizeBytes: number };
}

export interface OpsStats {
  userCount: number;
  projectCount: number;
  knowledgeFileCount: number;
  knowledgeChunkCount: number;
  plagiarismCount: number;
  reviewCount: number;
  directionCount: number;
  agentSessionCount: number;
  agentSessionErrorCount: number;
  agentSessionByStatus: { status: string; count: number }[];
  filesByCategory: { category: string; count: number }[];
}

export interface OpsSessionLastFail {
  tool: string;
  via?: string;
  reason?: string;
}

export interface OpsSessionListItem {
  id: string;
  userName?: string;
  projectId: string | null;
  projectTitle: string | null;
  directionSlug: string | null;
  goal: string;
  status: string;
  errorMessage: string | null;
  intentKind: string | null;
  lastFail: OpsSessionLastFail | null;
  updatedAt: string;
}

export interface OpsSessionList {
  items: OpsSessionListItem[];
  total: number;
}

export interface OpsTranscriptLine {
  kind: string;
  text?: string;
  tool?: string;
  params?: Record<string, string>;
  error?: string;
  sectionKey?: string;
}

export interface OpsTraceLine {
  at: number;
  tool: string;
  ok: boolean;
  via?: string;
  reason?: string;
}

export interface OpsSessionDetail {
  id: string;
  userName?: string;
  projectId: string | null;
  projectTitle: string | null;
  directionSlug: string | null;
  goal: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  iteration: number;
  toolCallCount: number;
  intentKind: string | null;
  error: string | null;
  transcript: OpsTranscriptLine[];
  transcriptDropped: number;
  toolTrace: OpsTraceLine[];
  toolTraceDropped: number;
}

export interface OpsLoopCodeCount {
  code: string;
  label: string;
  sessions: number;
  turns: number;
}

export interface OpsLoopSampleTurn {
  turn: number;
  user: string;
  codes: string[];
  seq: string;
}

export interface OpsLoopSample {
  id: string;
  status: string;
  updatedAt: string;
  codes: string[];
  turns: OpsLoopSampleTurn[];
}

export interface OpsLoopScan {
  sessions: number;
  turns: number;
  sickSessions: number;
  days: number;
  status: Record<string, number>;
  codes: OpsLoopCodeCount[];
  samples: OpsLoopSample[];
}

/**
 * Admin API 缁熶竴濂戠害 鈥?鍒嗛〉/鎼滅储/鍝嶅簲鏍煎紡
 */

import type { AgentPlan, AgentSummary } from "@/contracts/agent";
import type { AgentUiMessage } from "@/contracts/agent-session";
import type { DirectionAnalysis, DirectionAsset, DirectionRoadmap } from "@/contracts/direction";
import type { DirectionLiteratureEntry } from "@/contracts/direction-literature";

// ==================== 璇锋眰鍙傛暟 ====================

export interface AdminListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  template?: string;
  mode?: string;
  category?: string;
  risk?: string;
  grade?: string;
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  indexStatus?: string;
  /** 通用状态筛选（agent-sessions / directions 等） */
  status?: string;
}

// ==================== 鍒嗛〉鍝嶅簲 ====================

export interface AdminPaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== 绠€鍗曞搷搴?====================

export interface AdminSuccessResponse<T = undefined> {
  success: true;
  data?: T;
  message?: string;
}

export interface AdminErrorResponse {
  success: false;
  error: string;
}

export type AdminApiResponse<T = undefined> = AdminSuccessResponse<T> | AdminErrorResponse;

// ==================== 鍒犻櫎璇锋眰浣?====================

export interface AdminDeleteRequest {
  id?: string;
  ids?: string[];
  [key: string]: unknown;
}

// ==================== 浠〃鐩?/ 鍋ュ悍 / 鐢ㄩ噺 ====================

export interface AdminStats {
  userCount: number;
  projectCount: number;
  knowledgeFileCount: number;
  knowledgeChunkCount: number;
  plagiarismCount: number;
  reviewCount: number;
  directionCount: number;
  agentSessionCount: number;
  agentSessionErrorCount: number;
  analysisCount: number;
  filesByCategory: { category: string; count: number }[];
  projectsByTemplate: { template: string; count: number }[];
  projectsByMode: { mode: "review" | "research"; count: number }[];
  projectTrend: { date: string; count: number }[];
  recentActivity: { title: string; user: string; time: string }[];
  agentSessionByStatus: { status: string; count: number }[];
  agentSessionTrend: { date: string; count: number }[];
  recentDirections: { name: string; slug: string; status: string; time: string }[];
  aiUsage?: {
    totalCalls: number;
    todayCount: number;
    weekCount: number;
    byFeature: Record<string, number>;
    topUsers: { userId: string; userName?: string; count: number }[];
  };
  /** 扩写管道并发排队观测（内存累计，进程内实时） */
  writingQueue?: {
    waitCount: number;
    waitMs: number;
    timeoutCount: number;
    maxConcurrent: number;
  };
}

export interface AdminHealthAiProvider {
  provider: string;
  name: string;
  keyCount: number;
  model: string;
}

export interface AdminHealthData {
  db: { connected: boolean; provider: string; sizeBytes: number };
  knowledge: {
    fileCount: number;
    chunkCount: number;
    uncategorizedCount: number;
    /** PDF 磁盘抽样（最多 200 篇） */
    diskSampleSize: number;
    metadataOnlyInSample: number;
    pdfMissingInSample: number;
    categoryDriftInSample: number;
  };
  index: { indexFiles: string[]; totalSizeBytes: number };
  server: { uptime: number; nodeVersion: string; platform: string; memoryMB: number };
  /** AI Key / 模型可用性（ADMIN-042） */
  ai: {
    providers: AdminHealthAiProvider[];
    missingKeyProviders: string[];
  };
  /** Agent 会话健康 */
  agent: {
    totalSessions: number;
    errorSessions: number;
    errorSessions24h: number;
    runningSessions: number;
  };
  /** 期刊 IF/分区覆盖 */
  journalMetrics: {
    fileCount: number;
    withAnyMetrics: number;
    withImpactFactor: number;
    coveragePct: number;
    /** 书目含 ISSN 或刊名、理论上可被 IF 表命中的篇数 */
    withIssnOrJournal: number;
    lastImport: AdminJournalMetricsLastImport | null;
  };
}

/** 最近一次期刊指标导入摘要（SystemSetting JOURNAL_METRICS_LAST_IMPORT） */
export interface AdminJournalMetricsLastImport {
  at: string;
  filename: string;
  updated: number;
  matched: number;
  totalFiles: number;
  matchRate: number;
}

export interface AdminUsageStats {
  stats: Array<{ feature: string; count: number }>;
  recent: Array<{
    feature: string;
    userId?: string;
    userLabel?: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }>;
  totalEntries: number;
}

export interface AdminUsageTrendPoint {
  date: string;
  count: number;
}

export interface AdminUsageTrends {
  range: "30d" | "12w";
  points: AdminUsageTrendPoint[];
}

// ==================== 鐢ㄦ埛 / 椤圭洰 / 鏂囩尞 ====================

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  projectCount: number;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  projects: Array<{
    id: string;
    title: string;
    template: string;
    mode: string;
    lastUpdated: string;
    sectionCount: number;
    referenceCount: number;
  }>;
  aiUsage: Record<string, number>;
  totalAiCalls: number;
}

export interface AdminProjectRecord {
  id: string;
  title: string;
  template: string;
  mode: string;
  userName: string;
  userEmail?: string;
  /** 核心章节完成度 0-100（随 mode 使用不同章节键） */
  progress: number;
  /** 大纲任务完成度 0-100 */
  outlineProgress: number;
  outlineTasksDone: number;
  outlineTasksTotal: number;
  referenceCount: number;
  createdAt: string;
  lastUpdated: string;
}

export interface AdminKnowledgeFile {
  id: string;
  name: string;
  category: string;
  documentType: string;
  size: number;
  chunkCount: number;
  mtime: string | null;
  parseWarning?: "no_text" | "low_text" | null;
  bibEdited?: boolean;
  doi?: string | null;
  indexStatus: "unindexed" | "partial" | "ready";
  indexLabel: string;
}

export interface AdminListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminListResult<T> {
  data: T[];
  meta: AdminListMeta;
}

export interface AdminKnowledgeListResponse extends AdminListResult<AdminKnowledgeFile> {
  categoryStats: { category: string; count: number }[];
}

export interface AdminSearchUser {
  id: string;
  name: string;
  email: string;
  role: string;
  label: string;
  type: "user";
}

export interface AdminSearchProject {
  id: string;
  title: string;
  userName?: string | null;
  label: string;
  type: "project";
}

export interface AdminSearchKnowledge {
  id: string;
  name: string;
  category: string;
  label: string;
  type: "knowledge";
}

export interface AdminSearchDirection {
  id: string;
  name: string;
  slug: string;
  status: string;
  label: string;
  type: "direction";
}

export interface AdminSearchAgentSession {
  id: string;
  goal: string;
  status: string;
  label: string;
  type: "agent_session";
}

export interface AdminSearchResponse {
  users: AdminSearchUser[];
  projects: AdminSearchProject[];
  knowledge: AdminSearchKnowledge[];
  directions: AdminSearchDirection[];
  agentSessions: AdminSearchAgentSession[];
}

export interface AdminSettingRecord {
  key: string;
  maskedValue: string;
  updatedAt: string;
}

export type AiProviderKey = "deepseek" | "zhipu";
export type AiStatusProviderKey = AiProviderKey | "vision";

/** GET /api/admin/ai-status 返回的单个 provider 状态 */
export interface AdminAiStatusProvider {
  provider: AiStatusProviderKey;
  name: string;
  enabled: boolean;
  model: string;
  modelSource: "db" | "env" | "default";
  keyCount: number;
  /** 脱敏后的 key 展示 */
  keys: string[];
}

/** Agent 角色→provider 映射（当前生效） */
export interface AdminAiRoles {
  writer: AiProviderKey;
  verifier: AiProviderKey;
  refiner: AiProviderKey;
  planner: AiProviderKey;
}

/** GET /api/admin/ai-status 响应 */
export interface AdminAiStatusResponse {
  providers: AdminAiStatusProvider[];
  roles: AdminAiRoles;
}

// ==================== Agent 会话监控 ====================

export type AdminAgentSessionStatus = "running" | "interrupted" | "completed" | "error";

export interface AdminAgentSessionRecord {
  id: string;
  userId: string;
  userName?: string;
  projectId: string | null;
  projectTitle?: string | null;
  directionSlug: string | null;
  goal: string;
  status: AdminAgentSessionStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 会话详情：额外含快照概要 + 对话回放 */
export interface AdminAgentSessionDetail extends AdminAgentSessionRecord {
  iteration: number;
  toolCallCount: number;
  /** 对话气泡时间线（思考/工具调用/观察/摘要） */
  uiTranscript?: AgentUiMessage[];
  plan?: AgentPlan | null;
  error?: string | null;
  summary?: AgentSummary | null;
}

/** GET /api/admin/agent-sessions/stats — 会话深度分析 */
export interface AdminAgentSessionStats {
  total: number;
  errorCount: number;
  errorRate: number;
  avgToolCalls: number;
  avgIterations: number;
  byUser: {
    userId: string;
    userName?: string;
    sessionCount: number;
    errorCount: number;
    errorRate: number;
    avgToolCalls: number;
    avgIterations: number;
    lastActive: string;
  }[];
}

/** GET /api/admin/insights — 使用洞察（目标高频 / 工具榜 / 失败模式） */
export interface AdminInsights {
  totalSessions: number;
  errorSessionCount: number;
  goalIntents: { intent: string; count: number }[];
  toolCalls: { tool: string; count: number }[];
  errorPatterns: { pattern: string; count: number }[];
}

// ==================== 研究方向管理 ====================

export interface AdminDirectionRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  status: "active" | "archived";
  userId: string;
  userName?: string;
  assetCount: number;
  literatureCount: number;
  coreLiteratureCount: number;
  analysisAt: number | null;
  roadmapPapers: number;
  roadmapConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 方向详情：完整资产 / 文献语料 / 分析 / 路线图 */
export interface AdminDirectionDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  status: "active" | "archived";
  userId: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
  assets: DirectionAsset[];
  literatureEntries: DirectionLiteratureEntry[];
  literatureConfirmedAt: number | null;
  analysis: DirectionAnalysis | null;
  roadmap: DirectionRoadmap | null;
}

// ==================== 瀹℃煡 / 鏌ラ噸 ====================

export interface AdminPlagiarismRecord {
  id: string;
  projectId: string;
  title: string;
  status: string;
  maxSimilarity: number;
  overallRisk: string;
  matchCount: number;
  createdAt: string;
}

export interface AdminPlagiarismMatchRow {
  riskLevel: string;
  matchType: string;
  similarity: number;
  matchedText: string;
  matchedFrom: string;
  matchedUrl?: string | null;
}

export interface AdminPlagiarismDetail {
  id?: string;
  title?: string;
  matches?: AdminPlagiarismMatchRow[];
}

export interface AdminReviewRecord {
  id: string;
  projectId: string;
  title: string;
  status: string;
  overallScore: number;
  overallGrade: string;
  synopsis: string;
  issueCount: number;
  createdAt: string;
}

export interface AdminReviewDetail {
  check: Record<string, unknown>;
  issues: Array<{
    dimension: string;
    severity: string;
    type: string;
    description: string;
    suggestion: string;
    location: string;
  }>;
}

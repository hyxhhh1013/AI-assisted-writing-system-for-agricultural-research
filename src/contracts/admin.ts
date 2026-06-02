/**
 * Admin API 统一契约 — 分页/搜索/响应格式
 */

// ==================== 请求参数 ====================

export interface AdminListParams {
  q?: string; // 搜索关键词
  page?: number; // 页码，默认 1
  pageSize?: number; // 每页条数，默认 20
  sortBy?: string; // 排序字段
  sortOrder?: "asc" | "desc";
  // 扩展筛选
  template?: string;
  mode?: string;
  category?: string;
  risk?: string;
  grade?: string;
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ==================== 分页响应 ====================

export interface AdminPaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== 简单响应 ====================

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

// ==================== 删除请求体 ====================

export interface AdminDeleteRequest {
  id?: string;
  ids?: string[];
  [key: string]: unknown;
}

// ==================== 仪表盘 / 健康 / 用量 ====================

export interface AdminStats {
  userCount: number;
  projectCount: number;
  knowledgeFileCount: number;
  knowledgeChunkCount: number;
  plagiarismCount: number;
  reviewCount: number;
  filesByCategory: { category: string; count: number }[];
  projectsByTemplate: { template: string; count: number }[];
  projectTrend: { date: string; count: number }[];
  recentActivity: { title: string; user: string; time: string }[];
  aiUsage?: {
    totalCalls: number;
    todayCount: number;
    weekCount: number;
    byFeature: Record<string, number>;
    topUsers: { userId: string; count: number }[];
  };
}

export interface AdminHealthData {
  db: { connected: boolean; provider: string; sizeBytes: number };
  knowledge: { fileCount: number; chunkCount: number; uncategorizedCount: number };
  index: { indexFiles: string[]; totalSizeBytes: number };
  server: { uptime: number; nodeVersion: string; platform: string; memoryMB: number };
}

export interface AdminUsageStats {
  stats: Array<{ feature: string; count: number }>;
  recent: Array<{
    feature: string;
    userId?: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }>;
  totalEntries: number;
}

// ==================== 用户 / 项目 / 文献 ====================

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
  progress: number;
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
}

export interface AdminKnowledgeListResponse {
  files: AdminKnowledgeFile[];
  categoryStats: { category: string; count: number }[];
}

export interface AdminSettingRecord {
  key: string;
  maskedValue: string;
  updatedAt: string;
}

// ==================== 审查 / 查重 ====================

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

/**
 * Admin API 缁熶竴濂戠害 鈥?鍒嗛〉/鎼滅储/鍝嶅簲鏍煎紡
 */

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
  filesByCategory: { category: string; count: number }[];
  projectsByTemplate: { template: string; count: number }[];
  projectsByMode: { mode: "review" | "research"; count: number }[];
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

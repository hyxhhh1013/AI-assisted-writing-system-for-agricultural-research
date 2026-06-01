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

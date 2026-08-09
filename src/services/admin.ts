/**
 * Admin API 客户端（Admin UI → /api/admin/*）
 */

import type {
  AdminAgentSessionDetail,
  AdminAgentSessionRecord,
  AdminAgentSessionStats,
  AdminAiStatusResponse,
  AdminDirectionDetail,
  AdminDirectionRecord,
  AdminHealthData,
  AdminInsights,
  AdminJournalMetricsLastImport,
  AdminKnowledgeFile,
  AdminKnowledgeListResponse,
  AdminListParams,
  AdminListResult,
  AdminPlagiarismDetail,
  AdminPlagiarismRecord,
  AdminProjectRecord,
  AdminReviewDetail,
  AdminReviewRecord,
  AdminSearchResponse,
  AdminSettingRecord,
  AdminStats,
  AdminSuccessResponse,
  AdminUsageStats,
  AdminUsageTrends,
  AdminUserDetail,
  AdminUserRecord,
} from "@/contracts/admin";

export type {
  AdminAgentSessionDetail,
  AdminAgentSessionRecord,
  AdminAgentSessionStats,
  AdminAiRoles,
  AdminAiStatusProvider,
  AdminAiStatusResponse,
  AdminDirectionDetail,
  AdminDirectionRecord,
  AdminInsights,
  AdminHealthData,
  AdminJournalMetricsLastImport,
  AdminKnowledgeFile,
  AdminKnowledgeListResponse,
  AdminPlagiarismDetail,
  AdminPlagiarismRecord,
  AdminProjectRecord,
  AdminReviewDetail,
  AdminReviewRecord,
  AdminSettingRecord,
  AdminStats,
  AdminUsageStats,
  AdminUsageTrends,
  AdminUserDetail,
  AdminUserRecord,
} from "@/contracts/admin";

function buildQuery(params?: AdminListParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

async function parseError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return data.error || data.message || fallback;
}

async function parsePaginated<T>(res: Response): Promise<AdminListResult<T>> {
  const data = await parseJson<{
    data?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  }>(res);
  const list = data.data ?? [];
  const total = data.total ?? list.length;
  const page = data.page ?? 1;
  const pageSize = data.pageSize ?? (list.length || 20);
  const totalPages = data.totalPages ?? Math.max(1, Math.ceil(total / pageSize));
  return { data: list, meta: { total, page, pageSize, totalPages } };
}

/** GET /api/admin/stats */
export async function getAdminStats(): Promise<AdminStats | null> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) return null;
  return parseJson<AdminStats>(res);
}

/** GET /api/admin/health */
export async function getAdminHealth(): Promise<AdminHealthData | null> {
  const res = await fetch("/api/admin/health");
  const data = await parseJson<AdminSuccessResponse<AdminHealthData>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/usage */
export async function getAdminUsage(): Promise<AdminUsageStats> {
  const res = await fetch("/api/admin/usage");
  if (res.status === 403) throw new Error("无管理员权限");
  if (!res.ok) throw new Error("加载失败");
  return parseJson<AdminUsageStats>(res);
}

/** GET /api/admin/usage/trends */
export async function getAdminUsageTrends(range: "30d" | "12w" = "30d"): Promise<AdminUsageTrends> {
  const res = await fetch(`/api/admin/usage/trends?range=${range}`);
  if (!res.ok) throw new Error("加载趋势失败");
  const data = await parseJson<AdminUsageTrends & { success?: boolean }>(res);
  return { range: data.range, points: data.points };
}

/** GET /api/admin/search */
export async function searchAdmin(q: string): Promise<AdminSearchResponse> {
  const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
  const data = await parseJson<AdminSuccessResponse<AdminSearchResponse>>(res);
  return data.data ?? {
    users: [],
    projects: [],
    knowledge: [],
    directions: [],
    agentSessions: [],
  };
}

/** GET /api/admin/users */
export async function listAdminUsers(
  params?: Pick<AdminListParams, "q" | "page" | "pageSize" | "sortBy" | "sortOrder">,
): Promise<AdminListResult<AdminUserRecord>> {
  const res = await fetch(`/api/admin/users${buildQuery(params)}`);
  return parsePaginated<AdminUserRecord>(res);
}

/** GET /api/admin/users/[id] */
export async function getAdminUser(id: string): Promise<AdminUserDetail | null> {
  const res = await fetch(`/api/admin/users/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminUserDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** PATCH /api/admin/users — 切换角色 */
export async function updateAdminUserRole(userId: string, role: string): Promise<void> {
  await fetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
}

/** DELETE /api/admin/users */
export async function deleteAdminUser(userId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/admin/users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await parseJson<{ message?: string; error?: string }>(res);
  return { ok: res.ok, message: data.message, error: data.error };
}

/** GET /api/admin/projects */
export async function listAdminProjects(
  params?: Pick<AdminListParams, "q" | "template" | "mode" | "page" | "pageSize" | "sortBy" | "sortOrder">,
): Promise<AdminListResult<AdminProjectRecord>> {
  const res = await fetch(`/api/admin/projects${buildQuery(params)}`);
  return parsePaginated<AdminProjectRecord>(res);
}

/** DELETE /api/admin/projects */
export async function deleteAdminProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/projects", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (res.ok) return { ok: true };
  const error = await parseError(res, "删除失败");
  return { ok: false, error };
}

/** GET /api/admin/knowledge */
export async function listAdminKnowledge(
  params?: Pick<AdminListParams, "q" | "category" | "indexStatus" | "page" | "pageSize" | "sortBy" | "sortOrder">,
): Promise<AdminKnowledgeListResponse> {
  const res = await fetch(`/api/admin/knowledge${buildQuery(params)}`);
  const data = await parseJson<{
    data?: AdminKnowledgeFile[];
    files?: AdminKnowledgeFile[];
    categoryStats?: { category: string; count: number }[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  }>(res);
  const list = data.data ?? data.files ?? [];
  const total = data.total ?? list.length;
  const page = data.page ?? 1;
  const pageSize = data.pageSize ?? (list.length || 20);
  const totalPages = data.totalPages ?? Math.max(1, Math.ceil(total / pageSize));
  return {
    data: list,
    meta: { total, page, pageSize, totalPages },
    categoryStats: data.categoryStats ?? [],
  };
}

/** POST /api/admin/knowledge — 单篇重索引 */
export async function reindexAdminKnowledge(name: string, category: string): Promise<boolean> {
  const res = await fetch("/api/admin/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category }),
  });
  return res.ok;
}

/** DELETE /api/admin/knowledge — 单篇 */
export async function deleteAdminKnowledge(name: string, category: string): Promise<boolean> {
  const res = await fetch("/api/admin/knowledge", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category }),
  });
  return res.ok;
}

/** DELETE /api/admin/knowledge — 批量 */
export async function bulkDeleteAdminKnowledge(
  files: Array<{ name: string; category: string }>,
): Promise<boolean> {
  const res = await fetch("/api/admin/knowledge", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  return res.ok;
}

export interface JournalMetricsImportResult {
  ok: boolean;
  message?: string;
  matched?: number;
  updated?: number;
  skipped?: number;
  totalFiles?: number;
  lookupSize?: number;
  lookupIssn?: number;
  lookupJournal?: number;
  matchRate?: number;
  dryRun?: boolean;
  error?: string;
}

/** GET /api/admin/journal-metrics — 最近一次导入摘要 */
export async function getAdminJournalMetricsLastImport(): Promise<AdminJournalMetricsLastImport | null> {
  const res = await fetch("/api/admin/journal-metrics");
  const data = await parseJson<AdminSuccessResponse<{ lastImport: AdminJournalMetricsLastImport | null }>>(res);
  return data.success ? (data.data?.lastImport ?? null) : null;
}

/** POST /api/admin/journal-metrics — 上传 CSV/Excel 导入期刊 IF/分区 */
export async function importAdminJournalMetrics(
  file: File,
  options?: { dryRun?: boolean },
): Promise<JournalMetricsImportResult> {
  const form = new FormData();
  form.append("file", file);
  const q = options?.dryRun ? "?dryRun=true" : "";
  const res = await fetch(`/api/admin/journal-metrics${q}`, { method: "POST", body: form });
  const data = await parseJson<JournalMetricsImportResult & { error?: string }>(res);
  if (!res.ok) {
    return { ok: false, error: data.error ?? "导入失败" };
  }
  return {
    ok: true,
    message: data.message,
    matched: data.matched,
    updated: data.updated,
    lookupSize: data.lookupSize,
    dryRun: data.dryRun,
  };
}

/** GET /api/admin/settings */
export async function listAdminSettings(): Promise<AdminSettingRecord[]> {
  const res = await fetch("/api/admin/settings");
  const data = await parseJson<AdminSuccessResponse<AdminSettingRecord[]>>(res);
  return data.success ? (data.data ?? []) : [];
}

/** GET /api/admin/settings?key= — 检查 key 是否存在 */
export async function checkAdminSettingKey(key: string): Promise<boolean> {
  const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`);
  const data = await parseJson<AdminSuccessResponse<{ exists?: boolean }>>(res);
  return Boolean(data.success && data.data?.exists);
}

/** PUT /api/admin/settings */
export async function saveAdminSetting(
  key: string,
  value: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await parseJson<AdminSuccessResponse & { error?: string; message?: string }>(res);
  if (res.ok && data.success) return { ok: true, message: data.message };
  return { ok: false, error: data.error || data.message || `${res.status} ${res.statusText}` };
}

/** DELETE /api/admin/settings */
export async function deleteAdminSetting(key: string): Promise<boolean> {
  const res = await fetch("/api/admin/settings", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  return res.ok;
}

/** GET /api/admin/ai-status — 各 provider 当前生效模型与 Key 概览（不含明文）+ 角色映射 */
export async function getAiStatus(): Promise<AdminAiStatusResponse> {
  const res = await fetch("/api/admin/ai-status");
  const data = await parseJson<AdminSuccessResponse<AdminAiStatusResponse>>(res);
  return (
    data.data ?? { providers: [], roles: { writer: "deepseek", verifier: "deepseek", refiner: "deepseek", planner: "deepseek" } }
  );
}

/** POST /api/admin/ai-test — 用指定 key/model 做最小连通性测试（不落库） */
export async function testAiConnection(input: {
  provider: string;
  model?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/admin/ai-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<AdminSuccessResponse & { error?: string }>(res);
  if (res.ok && data.success) return { ok: true, message: data.message };
  return { ok: false, error: data.error || data.message || `${res.status} ${res.statusText}` };
}

/** GET /api/admin/agent-sessions — Agent 会话列表（跨用户） */
export async function listAdminAgentSessions(
  params: AdminListParams,
): Promise<AdminListResult<AdminAgentSessionRecord>> {
  const res = await fetch(`/api/admin/agent-sessions${buildQuery(params)}`);
  return parsePaginated<AdminAgentSessionRecord>(res);
}

/** GET /api/admin/agent-sessions/[id] — 会话详情（含快照概要） */
export async function getAdminAgentSessionDetail(
  id: string,
): Promise<AdminAgentSessionDetail | null> {
  const res = await fetch(`/api/admin/agent-sessions/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminAgentSessionDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/agent-sessions/stats — 会话深度分析（全量聚合 + 按用户 Top） */
export async function getAdminAgentSessionStats(): Promise<AdminAgentSessionStats | null> {
  const res = await fetch("/api/admin/agent-sessions/stats");
  const data = await parseJson<AdminSuccessResponse<AdminAgentSessionStats>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/insights — 使用洞察（目标高频 / 工具榜 / 失败模式） */
export async function getAdminInsights(): Promise<AdminInsights | null> {
  const res = await fetch("/api/admin/insights");
  const data = await parseJson<AdminSuccessResponse<AdminInsights>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** PATCH /api/admin/agent-sessions/[id] — 强制中断会话 */
export async function interruptAdminAgentSession(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/agent-sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "interrupt" }),
  });
  const data = await parseJson<AdminSuccessResponse & { error?: string }>(res);
  if (res.ok && data.success) return { ok: true };
  return { ok: false, error: data.error || data.message || "中断失败" };
}

/** GET /api/admin/directions — 研究方向列表 */
export async function listAdminDirections(
  params: AdminListParams,
): Promise<AdminListResult<AdminDirectionRecord>> {
  const res = await fetch(`/api/admin/directions${buildQuery(params)}`);
  return parsePaginated<AdminDirectionRecord>(res);
}

/** PATCH /api/admin/directions/[id] — 切换 active / archived */
export async function setAdminDirectionStatus(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/directions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await parseJson<AdminSuccessResponse & { error?: string }>(res);
  if (res.ok && data.success) return { ok: true };
  return { ok: false, error: data.error || data.message || "操作失败" };
}

/** GET /api/admin/directions/[id] — 方向详情（资产/文献/分析/路线图） */
export async function getAdminDirectionDetail(
  id: string,
): Promise<AdminDirectionDetail | null> {
  const res = await fetch(`/api/admin/directions/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminDirectionDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/plagiarism */
export async function listAdminPlagiarism(
  params?: Pick<AdminListParams, "risk" | "page" | "pageSize">,
): Promise<AdminListResult<AdminPlagiarismRecord>> {
  const res = await fetch(`/api/admin/plagiarism${buildQuery(params)}`);
  return parsePaginated<AdminPlagiarismRecord>(res);
}

/** GET /api/admin/plagiarism/[id] */
export async function getAdminPlagiarismDetail(id: string): Promise<AdminPlagiarismDetail | null> {
  const res = await fetch(`/api/admin/plagiarism/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminPlagiarismDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/reviews */
export async function listAdminReviews(
  params?: Pick<AdminListParams, "grade" | "page" | "pageSize">,
): Promise<AdminListResult<AdminReviewRecord>> {
  const res = await fetch(`/api/admin/reviews${buildQuery(params)}`);
  return parsePaginated<AdminReviewRecord>(res);
}

/** GET /api/admin/reviews/[id] */
export async function getAdminReviewDetail(id: string): Promise<AdminReviewDetail | null> {
  const res = await fetch(`/api/admin/reviews/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminReviewDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

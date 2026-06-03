/**
 * Admin API 客户端（Admin UI → /api/admin/*）
 */

import type {
  AdminHealthData,
  AdminKnowledgeFile,
  AdminKnowledgeListResponse,
  AdminListParams,
  AdminPlagiarismDetail,
  AdminPlagiarismRecord,
  AdminProjectRecord,
  AdminReviewDetail,
  AdminReviewRecord,
  AdminSettingRecord,
  AdminStats,
  AdminSuccessResponse,
  AdminUsageStats,
  AdminUserDetail,
  AdminUserRecord,
} from "@/contracts/admin";

export type {
  AdminHealthData,
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

/** GET /api/admin/users */
export async function listAdminUsers(params?: Pick<AdminListParams, "q">): Promise<AdminUserRecord[]> {
  const res = await fetch(`/api/admin/users${buildQuery(params)}`);
  const data = await parseJson<{ data?: AdminUserRecord[] }>(res);
  return data.data ?? [];
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
  params?: Pick<AdminListParams, "q" | "template" | "mode">,
): Promise<AdminProjectRecord[]> {
  const res = await fetch(`/api/admin/projects${buildQuery(params)}`);
  const data = await parseJson<{ data?: AdminProjectRecord[] }>(res);
  return data.data ?? [];
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
  params?: Pick<AdminListParams, "q" | "category">,
): Promise<AdminKnowledgeListResponse> {
  const res = await fetch(`/api/admin/knowledge${buildQuery(params)}`);
  const data = await parseJson<Partial<AdminKnowledgeListResponse>>(res);
  return { files: data.files ?? [], categoryStats: data.categoryStats ?? [] };
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

/** GET /api/admin/plagiarism */
export async function listAdminPlagiarism(risk?: string): Promise<AdminPlagiarismRecord[]> {
  const q = risk ? `?risk=${encodeURIComponent(risk)}` : "";
  const res = await fetch(`/api/admin/plagiarism${q}`);
  const data = await parseJson<{ data?: AdminPlagiarismRecord[] }>(res);
  return data.data ?? [];
}

/** GET /api/admin/plagiarism/[id] */
export async function getAdminPlagiarismDetail(id: string): Promise<AdminPlagiarismDetail | null> {
  const res = await fetch(`/api/admin/plagiarism/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminPlagiarismDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

/** GET /api/admin/reviews */
export async function listAdminReviews(grade?: string): Promise<AdminReviewRecord[]> {
  const q = grade ? `?grade=${encodeURIComponent(grade)}` : "";
  const res = await fetch(`/api/admin/reviews${q}`);
  const data = await parseJson<{ data?: AdminReviewRecord[] }>(res);
  return data.data ?? [];
}

/** GET /api/admin/reviews/[id] */
export async function getAdminReviewDetail(id: string): Promise<AdminReviewDetail | null> {
  const res = await fetch(`/api/admin/reviews/${id}`);
  const data = await parseJson<AdminSuccessResponse<AdminReviewDetail>>(res);
  return data.success ? (data.data ?? null) : null;
}

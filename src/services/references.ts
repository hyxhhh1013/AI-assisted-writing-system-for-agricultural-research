/** 引用 API 服务封装 */

import type {
  BatchUpsertReferencesRequest,
  FormattedRefsResponse,
  ReferenceSourceRecord,
  UpsertReferenceRequest,
} from "@/contracts/references";

export type {
  BatchUpsertReferencesRequest,
  FormattedRefsResponse,
  ReferenceMappingInput,
  ReferenceSourceRecord,
  UpsertReferenceRequest,
} from "@/contracts/references";

/** 批量将文件名格式化为 GB/T 7714 引文字符串 */
export async function formatFilenames(filenames: string[]): Promise<Record<string, string>> {
  if (filenames.length === 0) return {};
  const param = filenames.join(",");
  const res = await fetch(
    `/api/references?format=true&filenames=${encodeURIComponent(param)}`,
  );
  if (!res.ok) return {};
  const data = (await res.json()) as FormattedRefsResponse;
  return data.formatted ?? {};
}

/** 获取项目的引用-文献映射 */
export async function listByProject(
  projectId: string,
  refIndex?: number,
): Promise<ReferenceSourceRecord[]> {
  const params = new URLSearchParams({ projectId });
  if (refIndex !== undefined) {
    params.set("refIndex", String(refIndex));
  }
  const res = await fetch(`/api/references?${params.toString()}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "获取引用映射失败");
  }
  return res.json() as Promise<ReferenceSourceRecord[]>;
}

/** UI-PR-020 别名：与 listByProject 相同 */
export const listReferenceSources = listByProject;

/** 单条 upsert 引用映射 */
export async function upsertReference(payload: UpsertReferenceRequest): Promise<void> {
  const res = await fetch("/api/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存引用映射失败");
  }
}

/** 批量 upsert（AI 扩写 refMapping 持久化） */
export async function batchUpsertReferences(
  payload: BatchUpsertReferencesRequest,
): Promise<void> {
  const res = await fetch("/api/references?batch=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "批量保存引用映射失败");
  }
}

import type { TableSnapshot } from "@/lib/data-table-snapshot";

/** GET /api/projects/:id/data-preview — 已入库的一块在原附件里的前若干行 */
export async function fetchStoredTablePreview(
  projectId: string,
  fileName: string,
): Promise<TableSnapshot | null> {
  const q = new URLSearchParams({ fileName });
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/data-preview?${q}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { found?: boolean; snapshot?: TableSnapshot };
  if (!body.found || !body.snapshot) return null;
  return body.snapshot;
}

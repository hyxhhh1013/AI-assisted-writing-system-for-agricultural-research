import type {
  ExternalLiteratureHit,
  ImportExternalReferenceResponse,
  IngestExternalKnowledgeRequest,
  IngestExternalKnowledgeResponse,
  LiteratureSearchResponse,
} from "@/contracts/literature";
import type { ProjectReferenceRecord } from "@/contracts/project";

/** POST /api/literature/search */
export async function searchLiterature(
  query: string,
  limit?: number,
): Promise<LiteratureSearchResponse> {
  const res = await fetch("/api/literature/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "外部文献检索失败");
  }
  return res.json() as Promise<LiteratureSearchResponse>;
}

/** POST /api/projects/:id/references/import-external */
export async function importExternalReference(
  projectId: string,
  hit: ExternalLiteratureHit,
  index?: number,
): Promise<{ references: ProjectReferenceRecord[]; citation: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/references/import-external`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hit, index }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "加入参考文献失败");
  }
  const data = (await res.json()) as ImportExternalReferenceResponse;
  return data;
}

/** POST /api/knowledge/ingest-external — 加入知识库并尝试 OA 索引 */
export async function ingestExternalToKnowledge(
  body: IngestExternalKnowledgeRequest,
): Promise<IngestExternalKnowledgeResponse> {
  const res = await fetch("/api/knowledge/ingest-external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "加入知识库失败");
  }
  return res.json() as Promise<IngestExternalKnowledgeResponse>;
}

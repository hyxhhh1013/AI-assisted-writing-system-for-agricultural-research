/** Direction 文献 corpus API 封装 */

import type { DirectionDTO } from "@/contracts/direction";
import type {
  DirectionLiteratureEntry,
  DirectionLiteratureState,
} from "@/contracts/direction-literature";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import type { SourceRole } from "@/contracts/direction-writing-bridge";
import type { DirectionLiteratureCorpusPatchInput } from "@/lib/validations";

export async function patchLiteratureCorpus(
  slug: string,
  ops: DirectionLiteratureCorpusPatchInput["ops"],
): Promise<DirectionDTO> {
  const res = await fetch(`/api/directions/${slug}/literature-corpus`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  const data = await res.json().catch(() => ({})) as DirectionDTO & { error?: string };
  if (!res.ok) throw new Error(data.error || "更新文献 corpus 失败");
  return data;
}

export async function importExternalToCorpus(
  slug: string,
  hit: ExternalLiteratureHit,
  role?: SourceRole,
): Promise<{ entry: DirectionLiteratureEntry; direction: DirectionDTO }> {
  const res = await fetch(
    `/api/directions/${slug}/literature-corpus/import-external`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hit, role }),
    },
  );
  const data = await res.json().catch(() => ({})) as {
    entry?: DirectionLiteratureEntry;
    direction?: DirectionDTO;
    error?: string;
  };
  if (!res.ok || !data.entry || !data.direction) {
    throw new Error(data.error || "导入外部文献失败");
  }
  return { entry: data.entry, direction: data.direction };
}

export async function importKnowledgeToCorpus(
  slug: string,
  fileName: string,
  citation: string,
  role?: SourceRole,
): Promise<{ entry: DirectionLiteratureEntry; direction: DirectionDTO }> {
  const res = await fetch(
    `/api/directions/${slug}/literature-corpus/import-knowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, citation, role }),
    },
  );
  const data = await res.json().catch(() => ({})) as {
    entry?: DirectionLiteratureEntry;
    direction?: DirectionDTO;
    error?: string;
  };
  if (!res.ok || !data.entry || !data.direction) {
    throw new Error(data.error || "导入知识库文献失败");
  }
  return { entry: data.entry, direction: data.direction };
}

export function getLiteratureState(
  direction: Pick<DirectionDTO, "literatureCorpus">,
): DirectionLiteratureState {
  return direction.literatureCorpus ?? { entries: [] };
}

export async function confirmLiteratureCorpus(slug: string): Promise<DirectionDTO> {
  return patchLiteratureCorpus(slug, [{ op: "confirm" }]);
}

/** Direction 文献 corpus 服务端读写与 PATCH 逻辑 */

import prisma from "@/lib/prisma";
import {
  emptyLiteratureState,
  parseDirectionLiteratureState,
  type DirectionLiteratureEntry,
  type DirectionLiteratureState,
} from "@/contracts/direction-literature";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

export type LiteratureCorpusPatchOp =
  | { op: "upsert"; entry: DirectionLiteratureEntry }
  | { op: "delete"; entryId: string }
  | { op: "set_role"; entryId: string; role: DirectionLiteratureEntry["role"] }
  | { op: "confirm" }
  | { op: "import_kb_scan"; entries: DirectionLiteratureEntry[] };

function dedupeKey(entry: Pick<DirectionLiteratureEntry, "doi" | "title" | "sourceKey">): string {
  const doi = entry.doi?.trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const key = entry.sourceKey?.trim().toLowerCase();
  if (key) return `file:${key}`;
  return `title:${entry.title.trim().toLowerCase()}`;
}

export function applyLiteratureCorpusOps(
  state: DirectionLiteratureState,
  ops: LiteratureCorpusPatchOp[],
): DirectionLiteratureState {
  const next: DirectionLiteratureState = {
    entries: [...state.entries],
    confirmedAt: state.confirmedAt,
  };

  for (const op of ops) {
    if (op.op === "upsert") {
      const key = dedupeKey(op.entry);
      const idx = next.entries.findIndex((e) => dedupeKey(e) === key);
      if (idx >= 0) {
        next.entries[idx] = { ...next.entries[idx], ...op.entry, id: next.entries[idx].id };
      } else {
        next.entries.push(op.entry);
      }
      next.confirmedAt = undefined;
    } else if (op.op === "delete") {
      next.entries = next.entries.filter((e) => e.id !== op.entryId);
      next.confirmedAt = undefined;
    } else if (op.op === "set_role") {
      next.entries = next.entries.map((e) =>
        e.id === op.entryId ? { ...e, role: op.role } : e,
      );
      next.confirmedAt = undefined;
    } else if (op.op === "confirm") {
      next.confirmedAt = Date.now();
    } else if (op.op === "import_kb_scan") {
      const existing = new Set(next.entries.map(dedupeKey));
      for (const entry of op.entries) {
        const key = dedupeKey(entry);
        if (!existing.has(key)) {
          next.entries.push(entry);
          existing.add(key);
        }
      }
      next.confirmedAt = undefined;
    }
  }

  return next;
}

export async function readDirectionLiteratureState(
  directionId: string,
): Promise<DirectionLiteratureState> {
  const row = await prisma.direction.findUnique({
    where: { id: directionId },
    select: { literatureCorpus: true },
  });
  if (!row) return emptyLiteratureState();
  return parseDirectionLiteratureState(row.literatureCorpus);
}

export async function patchDirectionLiteratureCorpus(
  directionId: string,
  ops: LiteratureCorpusPatchOp[],
): Promise<DirectionLiteratureState> {
  const current = await readDirectionLiteratureState(directionId);
  const next = applyLiteratureCorpusOps(current, ops);
  await prisma.direction.update({
    where: { id: directionId },
    data: { literatureCorpus: next as object },
  });
  return next;
}

export function externalHitToCorpusEntry(
  hit: ExternalLiteratureHit,
  role: DirectionLiteratureEntry["role"] = "supporting",
): DirectionLiteratureEntry {
  return {
    id: `lit-ext-${hit.id}`,
    source: "external",
    externalId: hit.id,
    title: hit.title,
    citation: formatExternalLiteratureHit(hit),
    role,
    doi: hit.doi,
    addedAt: Date.now(),
  };
}

export function knowledgePdfToCorpusEntry(
  fileName: string,
  citation: string,
  role: DirectionLiteratureEntry["role"] = "supporting",
): DirectionLiteratureEntry {
  return {
    id: `lit-kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "knowledge_pdf",
    sourceKey: fileName,
    title: fileName.replace(/\.pdf$/i, ""),
    citation,
    role,
    addedAt: Date.now(),
  };
}

/**
 * 表格附件不再自动写入项目。
 * 这里只查询「这个文件（或它拆出的数据块）是否已经由用户确认入库」。
 */

import { parseDataClaims, parseDataSources } from "@/contracts/project";
import {
  inferAttachmentKind,
  type AttachmentIngestView,
} from "@/lib/agent/attachments/kind";
import { normalizeIngestSourceId } from "@/lib/agent/ingest-project-data";
import prisma from "@/lib/prisma";

function countClaimsForFile(
  fileName: string,
  claims: { sourceId: string }[],
): number {
  const id = normalizeIngestSourceId(fileName);
  const stem = id.replace(/^D-/, "");
  return claims.filter((c) => c.sourceId === id || (stem.length > 0 && c.sourceId.includes(stem))).length;
}

export function lookupIngestView(
  fileName: string,
  dataSourcesJson: string | null | undefined,
  dataClaimsJson: string | null | undefined,
): AttachmentIngestView | null {
  const sources = parseDataSources({ dataSources: dataSourcesJson ?? undefined });
  const hits = sources.filter((s) => sourceBelongsToUpload(s.fileName, fileName));
  const hit = hits[0];
  if (!hit) return null;
  const claims = parseDataClaims({ dataClaims: dataClaimsJson ?? undefined });
  const claimCount = hits.reduce(
    (n, source) => n + countClaimsForFile(source.fileName, claims),
    0,
  );
  return {
    status: "ingested",
    claimCount,
  };
}

function sourceBelongsToUpload(sourceFileName: string, uploadedName: string): boolean {
  return sourceFileName === uploadedName || sourceFileName.startsWith(`${uploadedName} · `);
}

export async function maybeAutoIngestTabularAttachment(opts: {
  userId: string;
  projectId: string;
  attachmentId: string;
  fileName: string;
}): Promise<AttachmentIngestView> {
  if (inferAttachmentKind(opts.fileName) !== "tabular") {
    return { status: "skipped" };
  }

  const existing = await prisma.project.findFirst({
    where: { id: opts.projectId, userId: opts.userId },
    select: { dataSources: true, dataClaims: true },
  });
  if (!existing) {
    return { status: "failed", error: "项目不存在或无权访问" };
  }
  const already = lookupIngestView(
    opts.fileName,
    existing.dataSources,
    existing.dataClaims,
  );
  if (already) return already;
  return { status: "pending" };
}

/** 提取完成后：只标记待确认，不把表格写入项目。 */
export async function autoIngestAfterExtract(opts: {
  userId: string;
  projectId: string | null | undefined;
  attachmentId: string;
  fileName: string;
}): Promise<AttachmentIngestView | null> {
  if (!opts.projectId) return null;
  if (inferAttachmentKind(opts.fileName) !== "tabular") return { status: "skipped" };
  try {
    return await maybeAutoIngestTabularAttachment({
      userId: opts.userId,
      projectId: opts.projectId,
      attachmentId: opts.attachmentId,
      fileName: opts.fileName,
    });
  } catch {
    return { status: "failed", error: "入库失败" };
  }
}

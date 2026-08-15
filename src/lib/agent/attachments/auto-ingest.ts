/**
 * 表格附件自动入库：与 ingest_project_data 同一套 analyzeFile + persist。
 * 幂等：同 fileName 覆盖。
 */

import { analyzeFile } from "@/services/data-analysis";
import { parseDataClaims, parseDataSources } from "@/contracts/project";
import { readAttachmentFile } from "@/lib/agent/attachments/storage";
import {
  inferAttachmentKind,
  type AttachmentIngestView,
} from "@/lib/agent/attachments/kind";
import {
  persistIngestedAnalysis,
  normalizeIngestSourceId,
} from "@/lib/agent/ingest-project-data";
import { enrichAnalysisWithPeakTable } from "@/lib/agent/xrd-ingested-peaks";
import prisma from "@/lib/prisma";

function countClaimsForFile(
  fileName: string,
  claims: { sourceId: string }[],
): number {
  const id = normalizeIngestSourceId(fileName);
  const stem = id.replace(/^D-/, "");
  return claims.filter((c) => c.sourceId === id || (stem.length > 0 && c.sourceId.includes(stem))).length;
}

function bufferToAnalyzeInput(buf: Buffer, fileName: string): string | ArrayBuffer {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls") {
    const copy = new ArrayBuffer(buf.byteLength);
    new Uint8Array(copy).set(buf);
    return copy;
  }
  return buf.toString("utf8");
}

export function lookupIngestView(
  fileName: string,
  dataSourcesJson: string | null | undefined,
  dataClaimsJson: string | null | undefined,
): AttachmentIngestView | null {
  const sources = parseDataSources({ dataSources: dataSourcesJson ?? undefined });
  const hit = sources.find((s) => s.fileName === fileName);
  if (!hit) return null;
  const claims = parseDataClaims({ dataClaims: dataClaimsJson ?? undefined });
  return {
    status: "ingested",
    claimCount: countClaimsForFile(fileName, claims),
  };
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

  let buf: Buffer;
  try {
    buf = readAttachmentFile(opts.userId, opts.attachmentId);
  } catch {
    return { status: "failed", error: "附件文件缺失" };
  }

  try {
    const input = bufferToAnalyzeInput(buf, opts.fileName);
    const { analysis: rawAnalysis, claims } = await analyzeFile(input, opts.fileName);
    const analysis = await enrichAnalysisWithPeakTable(rawAnalysis, input, opts.fileName);
    if (analysis.rowCount <= 0) {
      return { status: "failed", error: "没有有效数据行" };
    }
    await persistIngestedAnalysis({
      userId: opts.userId,
      projectId: opts.projectId,
      analysis,
      claims,
    });
    return { status: "ingested", claimCount: claims.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : "入库失败";
    return { status: "failed", error };
  }
}

/** 提取完成后：有 projectId 的表格自动入库，失败不回滚提取 */
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

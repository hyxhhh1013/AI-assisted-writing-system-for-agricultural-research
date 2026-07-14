import type { ExternalLiteratureHit } from "@/contracts/literature";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";
import { applyReferencePatchOps } from "@/lib/project-references";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import prisma from "@/lib/prisma";

export interface ImportAgentReferenceResult {
  citation: string;
  referenceCount: number;
}

/** Agent import_reference：外部文献写入项目参考文献 */
export async function importExternalReferenceToProject(
  userId: string,
  projectId: string,
  hit: ExternalLiteratureHit,
  index?: number,
): Promise<ImportAgentReferenceResult> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const citation = formatExternalLiteratureHit(hit);

  const existing = await prisma.reference.findMany({
    where: { projectId },
    select: { content: true },
  });
  if (existing.some((r) => r.content.trim() === citation.trim())) {
    throw new Error("该文献已在参考文献列表中");
  }

  await prisma.$transaction(async (tx) => {
    await applyReferencePatchOps(tx, projectId, [
      { op: "create", content: citation, ...(index !== undefined ? { index } : {}) },
    ]);
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞导入 */
  }

  const referenceCount = await prisma.reference.count({ where: { projectId } });
  return { citation, referenceCount };
}

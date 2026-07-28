import { applyReferencePatchOps } from "@/lib/project-references";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import prisma from "@/lib/prisma";

export interface PersistAgentDraftResult {
  sectionKey: string;
  referencesAdded: number;
}

/** 在章节末尾追加 Markdown（Agent 配图插入正文） */
export async function appendAgentSectionMarkdown(
  userId: string,
  projectId: string,
  sectionKey: string,
  markdown: string,
): Promise<{ sectionKey: string }> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const chunk = markdown.startsWith("\n") ? markdown : `\n${markdown}`;

  if (sectionKey === "abstract") {
    const row = await prisma.project.findUnique({
      where: { id: projectId },
      select: { abstract: true },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: {
        abstract: `${row?.abstract ?? ""}${chunk}`,
        lastUpdated: new Date(),
      },
    });
  } else {
    const existing = await prisma.section.findUnique({
      where: { projectId_key: { projectId, key: sectionKey } },
      select: { content: true },
    });
    const next = `${existing?.content ?? ""}${chunk}`;
    await prisma.section.upsert({
      where: { projectId_key: { projectId, key: sectionKey } },
      update: { content: next },
      create: { projectId, key: sectionKey, content: next },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });
  }

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞 */
  }

  return { sectionKey };
}

/** Agent 写工具：将正文与新增参考文献增量写入项目 */
export async function persistAgentDraft(
  userId: string,
  projectId: string,
  sectionKey: string,
  content: string,
  newReferences: string[] = [],
): Promise<PersistAgentDraftResult> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  if (sectionKey === "abstract") {
    await prisma.project.update({
      where: { id: projectId },
      data: { abstract: content, lastUpdated: new Date() },
    });
  } else {
    await prisma.section.upsert({
      where: { projectId_key: { projectId, key: sectionKey } },
      update: { content },
      create: { projectId, key: sectionKey, content },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });
  }

  let referencesAdded = 0;
  const trimmedNew = newReferences.map((r) => r.trim()).filter(Boolean);
  if (trimmedNew.length > 0) {
    const existing = await prisma.reference.findMany({
      where: { projectId },
      select: { content: true },
    });
    const existingSet = new Set(existing.map((r) => r.content.trim()));
    const toCreate = trimmedNew.filter((ref) => !existingSet.has(ref));
    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        await applyReferencePatchOps(
          tx,
          projectId,
          toCreate.map((refContent) => ({ op: "create" as const, content: refContent })),
        );
      });
      referencesAdded = toCreate.length;
    }
  }

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞 Agent 写回 */
  }

  return { sectionKey, referencesAdded };
}

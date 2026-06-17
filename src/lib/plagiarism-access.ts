import prisma from "@/lib/prisma";

/** 校验项目归属当前用户 */
export async function assertProjectOwnedByUser(projectId: string, userId: string): Promise<boolean> {
  const count = await prisma.project.count({ where: { id: projectId, userId } });
  return count > 0;
}

/** 校验查重记录可被当前用户访问（须关联其项目） */
export async function assertPlagiarismCheckOwnedByUser(checkId: string, userId: string): Promise<boolean> {
  const check = await prisma.plagiarismCheck.findFirst({
    where: {
      id: checkId,
      project: { userId },
    },
    select: { id: true },
  });
  return check != null;
}

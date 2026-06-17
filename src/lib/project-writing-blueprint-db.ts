import prisma from "@/lib/prisma";

/** Prisma Client 未 generate 时仍可读写作蓝图列 */
export async function readWritingBlueprint(projectId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ writingBlueprint: string | null }[]>`
    SELECT "writingBlueprint" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
  `;
  return rows[0]?.writingBlueprint ?? null;
}

/** null 表示清空；Prisma Client 滞后时仍可靠写入 */
export async function writeWritingBlueprint(
  projectId: string,
  value: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Project" SET "writingBlueprint" = ${value} WHERE "id" = ${projectId}
  `;
}

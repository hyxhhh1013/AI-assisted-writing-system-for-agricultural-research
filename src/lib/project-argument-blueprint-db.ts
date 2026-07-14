import prisma from "@/lib/prisma";

/** Prisma Client 未 generate 时仍可读论证蓝图列 */
export async function readArgumentBlueprint(projectId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ argumentBlueprint: string | null }[]>`
      SELECT "argumentBlueprint" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
    `;
    return rows[0]?.argumentBlueprint ?? null;
  } catch {
    return null;
  }
}

export async function writeArgumentBlueprint(
  projectId: string,
  value: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Project" SET "argumentBlueprint" = ${value} WHERE "id" = ${projectId}
  `;
}

import prisma from "@/lib/prisma";

export async function readArgumentBlueprint(projectId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ argumentBlueprint: string | null }[]>`
    SELECT "argumentBlueprint" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
  `;
  return rows[0]?.argumentBlueprint ?? null;
}

export async function writeArgumentBlueprint(
  projectId: string,
  value: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Project" SET "argumentBlueprint" = ${value} WHERE "id" = ${projectId}
  `;
}

export async function writeArgumentBlueprintTx(
  tx: { $executeRaw: typeof prisma.$executeRaw },
  projectId: string,
  value: string | null,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Project" SET "argumentBlueprint" = ${value} WHERE "id" = ${projectId}
  `;
}

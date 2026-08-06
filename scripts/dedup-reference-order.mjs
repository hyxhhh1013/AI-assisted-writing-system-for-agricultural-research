/**
 * 迁移 SEC-03 前：按 projectId 将 Reference.order 重排为 0..n-1，消除重复 order
 * 运行: node scripts/dedup-reference-order.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function renumberInOrder(refs) {
  return refs
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((ref, index) => ({ ...ref, order: index }));
}

async function main() {
  const projectIds = await prisma.reference.findMany({
    distinct: ["projectId"],
    select: { projectId: true },
  });

  let fixedProjects = 0;
  let fixedRows = 0;

  for (const { projectId } of projectIds) {
    const refs = await prisma.reference.findMany({
      where: { projectId },
      select: { id: true, order: true },
    });
    const normalized = renumberInOrder(refs);
    let changed = false;
    for (const row of normalized) {
      const prev = refs.find((r) => r.id === row.id);
      if (prev && prev.order !== row.order) {
        await prisma.reference.update({
          where: { id: row.id },
          data: { order: row.order },
        });
        fixedRows++;
        changed = true;
      }
    }
    if (changed) fixedProjects++;
  }

  const dupCheck = await prisma.$queryRaw`
    SELECT "projectId", "order", COUNT(*)::int AS cnt
    FROM "Reference"
    GROUP BY "projectId", "order"
    HAVING COUNT(*) > 1
  `;

  console.log(`✅ 完成：${fixedProjects} 个项目、${fixedRows} 行 order 已重排`);
  if (Array.isArray(dupCheck) && dupCheck.length > 0) {
    console.error("❌ 仍存在重复 order:", dupCheck);
    process.exit(1);
  }
  console.log("✅ 无 (projectId, order) 重复");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ dedup 失败:", err);
  process.exit(1);
});

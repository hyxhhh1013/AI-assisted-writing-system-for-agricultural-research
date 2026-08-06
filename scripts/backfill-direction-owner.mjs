/**
 * 将存量 Direction 归属到指定用户（默认：最早创建的用户）
 * 用法:
 *   node scripts/backfill-direction-owner.mjs
 *   node scripts/backfill-direction-owner.mjs --email=you@example.com
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseEmailArg() {
  const arg = process.argv.find((a) => a.startsWith("--email="));
  return arg?.slice("--email=".length) || null;
}

async function main() {
  const email = parseEmailArg();
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    console.error(email ? `❌ 未找到用户: ${email}` : "❌ 数据库中无用户");
    process.exit(1);
  }

  const result = await prisma.direction.updateMany({
    where: { NOT: { userId: user.id } },
    data: { userId: user.id },
  });

  console.log(`✅ 已将 ${result.count} 个方向归属到 ${user.email || user.id}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ backfill 失败:", err);
  process.exit(1);
});

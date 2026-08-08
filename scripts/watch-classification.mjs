/**
 * 监控 ReferenceSource 分类落库：验证 save_reference_classification 是否被实际调用。
 * 用法：
 *   node scripts/watch-classification.mjs            # 最近 20 条，含更新时间
 *   node scripts/watch-classification.mjs --poll      # 轮询模式，每 5s 打印新写入
 *   node scripts/watch-classification.mjs <projectId> # 指定项目
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

function readEnv(key) {
  try {
    const lines = readFileSync(".env", "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(new RegExp("^" + key + "=(.*)$"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function listRecent(projectId, since) {
  const where = {};
  if (projectId) where.projectId = projectId;
  if (since) where.createdAt = { gte: since };
  const rows = await prisma.referenceSource.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { refIndex: "asc" }],
    take: 50,
  });
  return rows;
}

const arg = process.argv[2];
if (arg === "--poll") {
  const seen = new Set();
  console.log(`[watch] 轮询模式（去重新写入），Ctrl+C 退出`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));
    const rows = await listRecent(process.argv[3]);
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      console.log(
        `[WRITE] ${r.createdAt.toISOString()} refIndex=${r.refIndex} category=${JSON.stringify(r.category)} source=${JSON.stringify(r.sourceName)}`
      );
    }
  }
} else {
  const rows = await listRecent(process.argv[2]);
  if (rows.length === 0) {
    console.log("ReferenceSource 表为空或该 project 无分类记录。");
    if (!process.argv[2]) {
      console.log("（提示：可传 projectId 过滤，或先跑一次 Agent 分类再查）");
    }
    await prisma.$disconnect();
    process.exit(0);
  }
  const projects = await prisma.reference.findMany({
    where: { projectId: rows[0].projectId },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const pids = [...new Set(rows.map((r) => r.projectId))];
  for (const pid of pids) {
    const proj = await prisma.project.findUnique({
      where: { id: pid },
      select: { id: true, title: true },
    });
    console.log(`\n=== project: ${proj?.title ?? pid} (${pid}) ===`);
    const own = rows.filter((r) => r.projectId === pid);
    for (const r of own) {
      console.log(
        `  [${r.refIndex}] ${r.category || "(无分类)"}  <-  ${r.sourceName || "(无来源)"}  @ ${r.createdAt.toISOString()}`
      );
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

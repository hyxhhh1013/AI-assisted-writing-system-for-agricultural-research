/**
 * 将索引阶段产出的文献元数据批量写入 Prisma KnowledgeFile（替代 metadata.json 双写）
 * 用法：node scripts/sync-knowledge-metadata-to-prisma.mjs [metadata.json 路径]
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const defaultPath = path.join(process.cwd(), "data/metadata.json");

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;
  if (!fs.existsSync(inputPath)) {
    console.log(`跳过 Prisma 同步：未找到 ${inputPath}`);
    await prisma.$disconnect();
    return;
  }

  const records = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  if (!Array.isArray(records)) {
    throw new Error("metadata 必须是数组");
  }

  let upserted = 0;
  let skipped = 0;

  for (const r of records) {
    if (!r?.name) {
      skipped++;
      continue;
    }
    try {
      const data = {
        name: r.name,
        category: r.category || "未分类",
        documentType: r.documentType || "paper",
        size: r.size || 0,
        mtime: r.mtime ? new Date(r.mtime) : new Date(),
        bib: r.bib ? JSON.stringify(r.bib) : null,
        gbTag: r.gbTag || null,
        parseWarning: r.parseWarning || null,
        bibEdited: !!r.bibEdited,
        chunkCount: typeof r.chunkCount === "number" ? r.chunkCount : 0,
      };
      await prisma.knowledgeFile.upsert({
        where: { name: r.name },
        update: data,
        create: data,
      });
      upserted++;
    } catch (err) {
      console.error(`  跳过 ${r.name}:`, err.message);
      skipped++;
    }
  }

  console.log(`Prisma 知识库元数据：写入 ${upserted} 条，跳过 ${skipped} 条`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

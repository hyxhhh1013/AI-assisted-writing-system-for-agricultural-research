/**
 * 一次性迁移：data/metadata.json → Prisma KnowledgeFile
 * 运行：npx tsx scripts/migrate-knowledge-to-prisma.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");

interface JsonRecord {
  name: string; category: string; documentType?: string;
  size: number; mtime: string; chunkCount: number;
  bib?: Record<string, unknown> | null; gbTag?: string | null;
  parseWarning?: string | null; bibEdited?: boolean;
}

async function main() {
  if (!fs.existsSync(METADATA_PATH)) {
    console.log("metadata.json 不存在，跳过迁移");
    await prisma.$disconnect();
    return;
  }

  const records: JsonRecord[] = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
  console.log(`找到 ${records.length} 条记录`);

  let created = 0, updated = 0, skipped = 0;

  for (const r of records) {
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
        bibEdited: r.bibEdited ?? false,
      };

      const existing = await prisma.knowledgeFile.findUnique({ where: { name: r.name } });
      if (existing) {
        await prisma.knowledgeFile.update({ where: { name: r.name }, data });
        updated++;
      } else {
        await prisma.knowledgeFile.create({ data });
        created++;
      }
    } catch (err) {
      console.error(`  跳过 ${r.name}:`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`完成: 新建 ${created}, 更新 ${updated}, 跳过 ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

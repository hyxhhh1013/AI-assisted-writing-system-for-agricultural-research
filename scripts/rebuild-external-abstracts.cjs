/**
 * 生产可用：补建外部摘要索引 + 自动归类（纯 Node，不依赖 tsx / src）
 *
 * 用法（服务器 /home/ubuntu/grainscript）：
 *   set -a && . ./.env && set +a
 *   node scripts/rebuild-external-abstracts.mjs
 *   node scripts/rebuild-external-abstracts.mjs --all
 *   node scripts/rebuild-external-abstracts.mjs --dry-run
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const EXTERNAL_ABSTRACT_CATEGORY = "外部摘要";
const ABS_CHUNK_SIZE = 1200;
const DATA_DIR = path.join(process.cwd(), "data");

const TITLE_CATEGORY_HINTS = [
  { pattern: /茶|绿茶|红茶|乌龙|普洱|香气|挥发性|杀青|摊放|茶汤/, category: "茶学" },
  { pattern: /烟花|烟火|推进剂|含能|火药|燃烧剂|高氯酸/, category: "烟花" },
  { pattern: /烤烟|烟草|烟叶|植烟|卷烟/, category: "烟草" },
  {
    pattern:
      /热解|共热解|热化学|裂解|pyrolysis|pyrolytic|torrefaction|生物质.*塑料|碳纳米|秸秆.*热解|营养元素.*迁移|生物炭|biochar/i,
    category: "热化学",
  },
  { pattern: /控释|缓释|包衣|包膜|肥料|氮素淋|生物炭基肥/, category: "控释肥类" },
];

function isSoftGroundable(text) {
  return typeof text === "string" && text.trim().length >= 80;
}

function inferPrimary(hintText) {
  const blob = hintText || "";
  for (const { pattern, category } of TITLE_CATEGORY_HINTS) {
    if (pattern.test(blob)) return category;
  }
  return EXTERNAL_ABSTRACT_CATEGORY;
}

function indexPath() {
  return path.join(DATA_DIR, `index_${EXTERNAL_ABSTRACT_CATEGORY}.json`);
}

function loadChunks() {
  const p = indexPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function splitAbstract(text, size) {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const parts = [];
  for (let i = 0; i < t.length; i += size) parts.push(t.slice(i, i + size));
  return parts;
}

function appendOrPatch({ preferredCategory, sourceName, title, abstract }) {
  const chunks = loadChunks();
  const existing = chunks.filter((c) => c.metadata?.source === sourceName);
  if (existing.length > 0) {
    let patched = false;
    for (const c of existing) {
      if (c.metadata.preferredCategory !== preferredCategory) {
        c.metadata.preferredCategory = preferredCategory;
        patched = true;
      }
      if (c.metadata.category !== EXTERNAL_ABSTRACT_CATEGORY) {
        c.metadata.category = EXTERNAL_ABSTRACT_CATEGORY;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(indexPath(), JSON.stringify(chunks), "utf8");
    }
    return { chunkCount: existing.length, appended: false, patched };
  }

  const parts = splitAbstract(abstract, ABS_CHUNK_SIZE);
  const toAdd = parts.map((part, i) => ({
    content:
      i === 0
        ? `标题：${title}\n来源：外部导入（摘要，无 PDF）\n\n摘要：${part}`
        : part,
    metadata: {
      source: sourceName,
      category: EXTERNAL_ABSTRACT_CATEGORY,
      preferredCategory,
      id: `${sourceName}#abs${i}`,
      documentType: "paper",
      chunkIndex: i,
    },
  }));

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const embPath = path.join(DATA_DIR, `index_${EXTERNAL_ABSTRACT_CATEGORY}.emb`);
  if (fs.existsSync(embPath)) {
    try {
      fs.unlinkSync(embPath);
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(indexPath(), JSON.stringify([...chunks, ...toAdd]), "utf8");
  return { chunkCount: toAdd.length, appended: true, patched: false };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const onlyMissing = !args.has("--all");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — source .env first");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const rows = await prisma.knowledgeFile.findMany({
    where: { size: 0 },
    select: { name: true, category: true, chunkCount: true, bib: true },
  });

  let indexed = 0;
  let categoryUpdated = 0;
  let skipped = 0;
  const samples = [];

  for (const row of rows) {
    let bib = {};
    try {
      bib = row.bib ? JSON.parse(row.bib) : {};
    } catch {
      skipped += 1;
      continue;
    }
    const abstract = typeof bib.abstract === "string" ? bib.abstract.trim() : "";
    if (!isSoftGroundable(abstract)) {
      skipped += 1;
      continue;
    }

    const title =
      (bib.title && String(bib.title).trim()) ||
      row.name.replace(/^\[(摘要|书目)\]\s*/, "").replace(/\.pdf$/i, "") ||
      row.name;
    const hintText = [title, bib.journal, abstract].filter(Boolean).join(" ");

    let preferred = inferPrimary(hintText);
    if (
      row.category &&
      row.category !== EXTERNAL_ABSTRACT_CATEGORY &&
      row.category !== "未分类"
    ) {
      preferred = row.category;
    }

    const needsChunks = row.chunkCount <= 0;
    if (onlyMissing && !needsChunks && row.category === preferred) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      samples.push({
        name: row.name,
        category: preferred,
        action: needsChunks ? "would_index" : "would_fix_category",
      });
      if (needsChunks) indexed += 1;
      else categoryUpdated += 1;
      continue;
    }

    const { chunkCount, appended } = appendOrPatch({
      preferredCategory: preferred,
      sourceName: row.name,
      title,
      abstract,
    });
    if (appended) indexed += 1;

    if (row.category !== preferred || row.chunkCount !== chunkCount) {
      await prisma.knowledgeFile.update({
        where: { name: row.name },
        data: { category: preferred, chunkCount, mtime: new Date() },
      });
      if (row.category !== preferred) categoryUpdated += 1;
    }

    if (samples.length < 20) {
      samples.push({
        name: row.name,
        category: preferred,
        chunkCount,
        action: appended ? "indexed" : "updated",
      });
    }
  }

  await prisma.$disconnect();
  console.log(
    JSON.stringify(
      { scanned: rows.length, indexed, categoryUpdated, skipped, dryRun, samples },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

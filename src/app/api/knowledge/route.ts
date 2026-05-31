import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { KnowledgeFileRecord } from "@/contracts/knowledge";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import { knowledgeMetadataPatchSchema } from "@/lib/validations";

const ARTICLES_DIR = path.join(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");
const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");

function loadMetadataRecords(): KnowledgeFileRecord[] {
  if (!fs.existsSync(METADATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as KnowledgeFileRecord[];
}

function saveMetadataRecords(records: KnowledgeFileRecord[]): void {
  fs.writeFileSync(METADATA_PATH, JSON.stringify(records, null, 2), "utf-8");
  invalidateBibCache();
}

function metadataByName(records: KnowledgeFileRecord[]): Map<string, KnowledgeFileRecord> {
  return new Map(records.map((record) => [record.name, record]));
}

function enrichFromMetadata(
  partial: KnowledgeFileRecord,
  metaMap: Map<string, KnowledgeFileRecord>,
): KnowledgeFileRecord {
  const stored = metaMap.get(partial.name);
  if (!stored) return partial;
  return {
    ...stored,
    ...partial,
    bib: stored.bib ?? partial.bib,
    gbTag: stored.gbTag ?? partial.gbTag,
    bibEdited: stored.bibEdited,
    size: stored.size ?? partial.size,
    mtime: stored.mtime || partial.mtime,
  };
}

function matchesQuery(record: KnowledgeFileRecord, query: string): boolean {
  const q = query.toLowerCase();
  if (record.name.toLowerCase().includes(q)) return true;
  if (record.category.toLowerCase().includes(q)) return true;
  const bib = record.bib;
  if (bib?.title?.toLowerCase().includes(q)) return true;
  if (bib?.firstAuthor?.toLowerCase().includes(q)) return true;
  if (bib?.journal?.toLowerCase().includes(q)) return true;
  if (bib?.authors?.some((author) => author.toLowerCase().includes(q))) return true;
  return false;
}

function cleanBibPayload(bib: Record<string, unknown>): KnowledgeFileRecord["bib"] {
  const cleaned = Object.fromEntries(
    Object.entries(bib).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );
  return Object.keys(cleaned).length > 0 ? cleaned as KnowledgeFileRecord["bib"] : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const query = searchParams.get("q")?.toLowerCase();
    const searchType = searchParams.get("type") || "name"; // name | semantic
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    // RAG 语义搜索
    if (searchType === "semantic" && query) {
      const cat = category && category !== "全部" ? category : undefined;
      const metaMap = metadataByName(loadMetadataRecords());
      // 检索更多 chunk，确保分页后有足够的来源多样性
      const results = await localRAG.search(query, { limit: 50, category: cat });

      // 先按 source 分组（不分页 chunk），每个 source 收集其全部匹配 chunk
      const grouped = new Map<string, { name: string; category: string; chunks: typeof results; chunkCount: number }>();
      for (const r of results) {
        const key = r.metadata.source;
        if (!grouped.has(key)) {
          grouped.set(key, { name: key, category: r.metadata.category, chunks: [], chunkCount: 0 });
        }
        const g = grouped.get(key)!;
        g.chunks.push(r);
        g.chunkCount++;
      }

      // 按匹配 chunk 数量降序排列（最相关的文献排前面）
      const sources = Array.from(grouped.values())
        .sort((a, b) => b.chunkCount - a.chunkCount);

      const total = sources.length;
      const start = (page - 1) * pageSize;
      const paged = sources.slice(start, start + pageSize);

      return NextResponse.json({
        files: paged.map((g) => enrichFromMetadata({
          name: g.name,
          category: g.category,
          documentType: g.chunks[0]?.metadata?.documentType || "paper",
          chunkCount: g.chunkCount,
          size: 0,
          mtime: "",
          _snippets: g.chunks.map((c) => c.content.slice(0, 300)),
        }, metaMap)),
        total,
        page,
        pageSize,
        searchType: "semantic",
        categories: [],
      });
    }

    const metadata = loadMetadataRecords();
    if (metadata.length === 0) {
      return NextResponse.json({ files: [], total: 0, categories: ["全部"] });
    }

    const categories = Array.from(new Set(metadata.map((m) => m.category)));

    let filtered = metadata;
    if (category && category !== "全部") {
      filtered = filtered.filter((m) => m.category === category);
    }
    if (query) {
      filtered = filtered.filter((m) => matchesQuery(m, query));
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFiles = filtered.slice(start, end);

    return NextResponse.json({
      files: paginatedFiles,
      total,
      page,
      pageSize,
      categories: ["全部", ...categories],
      searchType: "name",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "reindex") {
      // 兼容旧调用：重定向到流式接口说明
      return NextResponse.json(
        { error: "请使用 POST /api/knowledge/reindex 获取流式进度" },
        { status: 410 },
      );
    }

    // 处理文件上传
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const category = formData.get("category") as string || "未分类";
    const documentType = formData.get("documentType") as string || "paper";

    if (!file) {
      return NextResponse.json({ error: "未发现上传文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const targetDir = category === "未分类" 
      ? ARTICLES_DIR 
      : path.join(ARTICLES_DIR, category);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, file.name);
    fs.writeFileSync(filePath, buffer);

    // 同步更新 metadata.json，使文件立即可见于列表
    if (fs.existsSync(METADATA_PATH)) {
      const metadata = loadMetadataRecords();
      const existingIdx = metadata.findIndex((m) => m.name === file.name);
      const entry: KnowledgeFileRecord = {
        name: file.name,
        category,
        documentType,
        chunkCount: 0,
        size: buffer.length,
        mtime: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        metadata[existingIdx] = { ...metadata[existingIdx], ...entry, bib: metadata[existingIdx].bib, bibEdited: metadata[existingIdx].bibEdited };
      } else {
        metadata.push(entry);
      }
      saveMetadataRecords(metadata);
    }

    return NextResponse.json({ message: "文件上传成功", name: file.name });

  } catch (error: unknown) {
    logger.error("Knowledge API error:", error);
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, files, newCategory } = body;

    if (action === "update_metadata") {
      const parsed = knowledgeMetadataPatchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数无效" }, { status: 400 });
      }

      const metadata = loadMetadataRecords();
      const entry = metadata.find((m) => m.name === parsed.data.name);
      if (!entry) {
        return NextResponse.json({ error: `文献不存在: ${parsed.data.name}` }, { status: 404 });
      }

      entry.bib = cleanBibPayload(parsed.data.bib);
      entry.bibEdited = true;
      if (parsed.data.documentType) entry.documentType = parsed.data.documentType;
      if (parsed.data.gbTag) entry.gbTag = parsed.data.gbTag;
      saveMetadataRecords(metadata);

      return NextResponse.json({ message: "书目信息已保存" });
    }

    if (action === "batch_move") {
      if (!files || !Array.isArray(files) || !newCategory) {
        return NextResponse.json({ error: "参数不完整" }, { status: 400 });
      }

      const results = { success: 0, failed: 0 };
      const newDir = path.join(ARTICLES_DIR, newCategory === "未分类" ? "" : newCategory);
      
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      for (const file of files) {
        try {
          const oldPath = path.join(ARTICLES_DIR, file.category === "未分类" ? "" : file.category, file.name);
          const newPath = path.join(newDir, file.name);
          
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            results.success++;
          } else {
            results.failed++;
          }
        } catch (e) {
          results.failed++;
        }
      }

      // 同步更新 metadata.json
      if (fs.existsSync(METADATA_PATH)) {
        const metadata = loadMetadataRecords();
        for (const file of files) {
          const entry = metadata.find((m) => m.name === file.name);
          if (entry) entry.category = newCategory;
        }
        saveMetadataRecords(metadata);
      }

      return NextResponse.json({ message: `批量移动完成：成功 ${results.success}，失败 ${results.failed}` });
    }

    // 原有的单文件修改逻辑
    const { name, oldCategory, documentType } = body;
    if (!name || !oldCategory || !newCategory) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    // 在所有子目录中查找源文件（metadata 可能跟实际目录不一致）
    let oldPath = path.join(ARTICLES_DIR, oldCategory === "未分类" ? "" : oldCategory, name);
    if (!fs.existsSync(oldPath)) {
      // 搜索所有子目录
      const found: string[] = [];
      for (const entry of fs.readdirSync(ARTICLES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(ARTICLES_DIR, entry.name, name);
        if (fs.existsSync(candidate)) found.push(candidate);
      }
      if (found.length === 0) {
        return NextResponse.json({ error: `文件不存在: ${name}` }, { status: 404 });
      }
      oldPath = found[0];
    }

    const newDir = path.join(ARTICLES_DIR, newCategory === "未分类" ? "" : newCategory);
    const newPath = path.join(newDir, name);

    if (!fs.existsSync(oldPath)) {
      return NextResponse.json({ error: "源文件不存在" }, { status: 404 });
    }

    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }

    fs.renameSync(oldPath, newPath);

    // 同步更新 metadata.json
    if (fs.existsSync(METADATA_PATH)) {
      const metadata = loadMetadataRecords();
      const entry = metadata.find((m) => m.name === name);
      if (entry) {
        entry.category = newCategory;
        if (documentType) entry.documentType = documentType;
      }
      saveMetadataRecords(metadata);
    }

    return NextResponse.json({ message: "分类更新成功" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const category = searchParams.get("category");
    const isBatch = searchParams.get("batch") === "true";

    if (isBatch) {
      const { files } = await req.json();
      if (!files || !Array.isArray(files)) {
        return NextResponse.json({ error: "未提供待删除文件列表" }, { status: 400 });
      }

      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(ARTICLES_DIR, file.category === "未分类" ? "" : file.category, file.name);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
      return NextResponse.json({ message: `成功删除 ${deletedCount} 个文件` });
    }

    if (!name || !category) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const filePath = path.join(ARTICLES_DIR, category === "未分类" ? "" : category, name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ message: "文件已删除" });
    } else {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { localRAG } from "@/lib/rag";

const execPromise = promisify(exec);
const ARTICLES_DIR = path.join(process.cwd(), "热化学小组文章-2024.12.27");
const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");

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
        files: paged.map(g => ({
          name: g.name,
          category: g.category,
          documentType: g.chunks[0]?.metadata?.documentType || "paper",
          chunkCount: g.chunkCount,
          size: 0,
          mtime: "",
          // 返回完整 chunk 内容（截断到 300 字），方便前端展示相关片段
          _snippets: g.chunks.map(c => c.content.slice(0, 300)),
        })),
        total,
        page,
        pageSize,
        searchType: "semantic",
        categories: [],
      });
    }

    // 原有文件名搜索
    if (!fs.existsSync(METADATA_PATH)) {
      return NextResponse.json({ files: [], total: 0, categories: ["全部"] });
    }

    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
    const categories = Array.from(new Set(metadata.map((m: any) => m.category)));

    let filtered = metadata;
    if (category && category !== "全部") {
      filtered = filtered.filter((m: any) => m.category === category);
    }
    if (query) {
      filtered = filtered.filter((m: any) =>
        m.name.toLowerCase().includes(query) ||
        m.category.toLowerCase().includes(query)
      );
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "reindex") {
      // 运行索引脚本
      const { stdout, stderr } = await execPromise("node scripts/index-pdfs.mjs");
      console.log("Indexing output:", stdout);
      if (stderr) console.error("Indexing stderr:", stderr);
      
      // 强制重新加载 RAG 索引以清除缓存
      localRAG.reload();
      
      return NextResponse.json({ message: "索引更新成功", details: stdout });
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
      const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
      const existingIdx = metadata.findIndex((m: any) => m.name === file.name);
      const entry = {
        name: file.name,
        category,
        documentType,
        chunkCount: 0,
        size: buffer.length,
        mtime: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        metadata[existingIdx] = entry;
      } else {
        metadata.push(entry);
      }
      fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), "utf-8");
    }

    return NextResponse.json({ message: "文件上传成功", name: file.name });

  } catch (error: any) {
    console.error("Knowledge API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, files, newCategory } = body;

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
        const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
        for (const file of files) {
          const entry = metadata.find((m: any) => m.name === file.name);
          if (entry) entry.category = newCategory;
        }
        fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), "utf-8");
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
      const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
      const entry = metadata.find((m: any) => m.name === name);
      if (entry) {
        entry.category = newCategory;
        if (documentType) entry.documentType = documentType;
      }
      fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), "utf-8");
    }

    return NextResponse.json({ message: "分类更新成功" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { localRAG } from "@/lib/rag";
import { getErrorMessage } from "@/lib/error-utils";

/**
 * 按文献源文件名获取知识库 content chunks
 *
 * GET /api/knowledge/source?name=2023_Zhang_et_al.pdf&maxChunks=5
 *   返回：{ source: string, chunks: [{ content, pageStart, pageEnd }] }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const maxChunks = parseInt(searchParams.get("maxChunks") || "5", 10);

    if (!name) {
      return NextResponse.json({ error: "缺少文献名称" }, { status: 400 });
    }

    // 从 RAG 索引获取该文献的所有 chunk（按页码排序）
    const fullText = await localRAG.getFullText(name);

    if (!fullText) {
      return NextResponse.json(
        { source: name, chunks: [], message: "未在知识库中找到该文献" },
        { status: 200 }
      );
    }

    // 按段落分割作为 chunks
    const paragraphs = fullText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    const chunks = paragraphs.slice(0, maxChunks).map((content, i) => ({
      content: content.slice(0, 1000),
      index: i + 1,
    }));

    return NextResponse.json({
      source: name,
      chunks,
      totalChunks: paragraphs.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

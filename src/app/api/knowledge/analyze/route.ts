import { NextRequest, NextResponse } from "next/server";
import { localRAG } from "@/lib/rag";
import { callAI, getAIError } from "@/lib/ai";
import {
  KNOWLEDGE_ANALYZE_SYSTEM,
  buildFullAnalysisPrompt,
  buildChunkAnalysisPrompt,
} from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { filename, chunkIndex, mode = "chunk" } = await req.json();

    if (!filename) {
      return NextResponse.json({ error: "未指定文件名" }, { status: 400 });
    }

    const fullText = localRAG.getFullText(filename);
    if (!fullText) {
      return NextResponse.json({ error: "未找到该文献的索引内容，请先重建索引" }, { status: 404 });
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 500 });
    }

    let context = "";
    let prompt = "";
    let totalChunks = 1;
    let safeChunkIndex = 0;

    if (mode === "full") {
      const maxLen = 120000;
      if (fullText.length > maxLen) {
        const lastPeriod = fullText.lastIndexOf(".", maxLen);
        const lastNewline = fullText.lastIndexOf("\n", maxLen);
        const boundary = Math.max(lastPeriod, lastNewline);
        context = fullText.slice(0, boundary > maxLen * 0.8 ? boundary : maxLen);
      } else {
        context = fullText;
      }
      prompt = buildFullAnalysisPrompt(filename, context);
    } else {
      const chunkSize = 10000;
      totalChunks = Math.ceil(fullText.length / chunkSize);
      safeChunkIndex = Math.max(0, Math.min(chunkIndex || 0, totalChunks - 1));
      const start = safeChunkIndex * chunkSize;
      context = fullText.slice(start, start + chunkSize);
      prompt = buildChunkAnalysisPrompt(filename, context, safeChunkIndex, totalChunks);
    }

    const response = await callAI({
      provider: "deepseek",
      messages: [
        { role: "system", content: KNOWLEDGE_ANALYZE_SYSTEM },
        { role: "user", content: prompt },
      ],
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    return new NextResponse(response.body, {
      headers: {
        "X-Total-Chunks": totalChunks.toString(),
        "X-Current-Chunk": safeChunkIndex.toString(),
        "X-Analysis-Mode": mode,
      },
    });
  } catch (error: any) {
    console.error("Analysis API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

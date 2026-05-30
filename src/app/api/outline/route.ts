import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildOutlinePrompt } from "@/lib/prompts";
import { validateBody } from "@/lib/api-validate";
import { outlineSchema } from "@/lib/validations";

const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");

/** 从 researchDirection 中匹配最相关的知识库分类 */
function matchCategory(direction: string): string | null {
  if (!fs.existsSync(METADATA_PATH)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as {
      category: string;
    }[];
    const categories = Array.from(new Set(metadata.map((m) => m.category))).filter(
      (c) => c && c !== "未分类",
    );

    if (categories.length === 0) return null;

    const kw = direction.toLowerCase();
    // 按匹配长度排序，取最长的匹配（"热化学" 比 "热" 更准确）
    const matches = categories
      .map((cat) => ({
        cat,
        score: cat.split(/[\s\-_]/).filter((w) => kw.includes(w.toLowerCase())).length,
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    return matches[0]?.cat || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(outlineSchema, await req.json());
    if (ve) return ve;

    const { title, researchDirection: rawDir, language, category } = data;
    const researchDirection = rawDir ?? "";

    if (!researchDirection) {
      return new Response(JSON.stringify({ error: "研究方向不能为空" }), { status: 400 });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    // 手动指定分类优先，否则自动匹配研究方向到知识库分类
    const targetCategory = category && category !== "全部" ? category : matchCategory(researchDirection);
    const contextChunks = await localRAG.search(`${title} ${researchDirection}`, {
      limit: 10,
      category: targetCategory || undefined,
    });
    const contextText = contextChunks
      .map((c) => {
        const cleaned = c.content.replace(/\[(\d+[\d,\s\-–—]*)\]/g, "[文献$1]");
        return `[来自文献: ${formatRagCitation(c)}]\n${cleaned}`;
      })
      .join("\n\n");

    const systemPrompt = buildOutlinePrompt({ title, researchDirection, language, contextText });

    const response = await callAI({
      provider,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `论文题目：${title}\n研究方向：${researchDirection}` },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAIResponse(response)) {
            if (chunk.content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    logger.error("Outline Generation Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
    });
  }
}

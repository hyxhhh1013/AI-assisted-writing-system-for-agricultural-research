import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { matchCategoryFromDirection } from "@/lib/knowledge-metadata";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildOutlinePrompt } from "@/lib/prompts";
import { validateBody } from "@/lib/api-validate";
import { outlineSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(outlineSchema, await req.json());
    if (ve) return ve;

    const { title, researchDirection: rawDir, language, category, projectMode, userSkeleton } = data;
    const researchDirection = (rawDir?.trim() || title.trim());

    if (!researchDirection) {
      return new Response(JSON.stringify({ error: "请填写论文题目或研究方向" }), { status: 400 });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    // 手动指定分类优先，否则自动匹配研究方向到知识库分类
    const targetCategory =
      category && category !== "全部"
        ? category
        : await matchCategoryFromDirection(researchDirection);
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

    const systemPrompt = buildOutlinePrompt({
      title,
      researchDirection,
      language,
      contextText,
      projectMode: projectMode ?? "review",
      userSkeleton,
    });

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
        } catch (error: unknown) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: getErrorMessage(error) })}\n\n`));
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
  } catch (error: unknown) {
    logger.error("Outline Generation Error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) || "Internal Server Error" }), {
      status: 500,
    });
  }
}

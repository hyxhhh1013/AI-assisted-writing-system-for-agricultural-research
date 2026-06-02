import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildConsistencyFixPrompt } from "@/lib/prompts/consistency";
import { getErrorMessage } from "@/lib/error-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { issue, sectionContents, title, projectMode } = await req.json();
    if (!issue?.description || !issue?.suggestion || !sectionContents || !title) {
      return new Response(JSON.stringify({ error: "缺少必填字段" }), { status: 400 });
    }

    const keyCfg = getAgentModelConfig("writer");
    if (keyCfg.keyError) {
      return new Response(JSON.stringify({ error: keyCfg.keyError }), { status: 500 });
    }

    const relevantContent = (issue.sections as string[])
      .map((s: string) => `【${s}】\n${(sectionContents as Record<string, string>)[s] || ""}`)
      .join("\n\n");

    const prompt = buildConsistencyFixPrompt({
      title,
      relevantContent,
      issue: {
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        suggestion: issue.suggestion,
      },
      projectMode,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          emit({ type: "status", status: "writing" });

          const response = await callAI({
            provider: keyCfg.provider,
            messages: [
              { role: "system", content: "你是农业学术主编，根据审查意见进行精准的学术文本修正。" },
              { role: "user", content: prompt },
            ],
          });

          if (!response.ok || !response.body) throw new Error("AI 调用失败");

          let fullText = "";
          for await (const chunk of streamAIResponse(response)) {
            if (chunk.content) {
              fullText += chunk.content;
              emit({ type: "delta", content: chunk.content });
            }
          }

          // 解析输出，提取章节标记
          let targetSection = (issue.sections as string[])[0] || "";
          let content = fullText;
          const sectionMatch = fullText.match(/\[SECTION:([^\]]+)\]\s*([\s\S]*)/);
          if (sectionMatch) {
            targetSection = sectionMatch[1].trim();
            content = sectionMatch[2].trim();
          }

          emit({ type: "done", sectionKey: targetSection, content });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: unknown) {
          logger.error("Fix error:", error);
          try { emit({ type: "error", error: getErrorMessage(error) }); } catch {}
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    logger.error("Fix API error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) || "Internal Server Error" }), { status: 500 });
  }
}

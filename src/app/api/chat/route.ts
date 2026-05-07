import { NextRequest } from "next/server";
import { localRAG } from "@/lib/rag";
import { callAI, streamAIResponse } from "@/lib/ai";

const SYSTEM_BASE = `你是一个专业的农业科研助手，擅长热化学、生物质和碳材料领域。以下是一篇学术文献的完整内容。请基于此文献内容回答用户的问题。

要求：
1. 回答必须基于文献内容，不得编造
2. 引用文献中的具体数据或结论时，请注明出处（如"根据本文第X节的描述..."）
3. 如果文献中没有相关信息，请诚实说明
4. 使用中文回答
5. 回答简洁专业，条理清晰`;

export async function POST(req: NextRequest) {
  try {
    const { filename, messages } = await req.json();

    if (!filename || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing filename or messages" }),
        { status: 400 },
      );
    }

    // 取文献全文作为上下文
    const fullText = localRAG.getFullText(filename);
    if (!fullText) {
      return new Response(
        JSON.stringify({ error: "文献内容未找到，请先构建索引" }),
        { status: 404 },
      );
    }

    // 截断以适配上下文窗口
    const maxChars = 80000;
    const paperContext =
      fullText.length > maxChars
        ? fullText.slice(0, maxChars / 2) +
          "\n…[省略中间部分]…\n" +
          fullText.slice(-maxChars / 2)
        : fullText;

    const systemMessage = {
      role: "system",
      content: `${SYSTEM_BASE}\n\n【文献名称】：${filename}\n【文献全文内容】：\n${paperContext}`,
    };

    const allMessages = [systemMessage, ...messages];

    const response = await callAI({
      provider: "deepseek",
      messages: allMessages,
    });

    if (!response.ok || !response.body) {
      throw new Error("AI 调用失败");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAIResponse(response)) {
            if (chunk.content) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}\n\n`,
                ),
              );
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`),
          );
          controller.close();
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
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
    });
  }
}

import { NextRequest } from "next/server";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { issue, sectionContents, title } = await req.json();
    if (!issue?.description || !issue?.suggestion || !sectionContents || !title) {
      return new Response(JSON.stringify({ error: "缺少必填字段" }), { status: 400 });
    }

    const keyCfg = getAgentModelConfig("writer");
    if (keyCfg.keyError) {
      return new Response(JSON.stringify({ error: keyCfg.keyError }), { status: 500 });
    }

    // 收集相关章节内容
    const relevantContent = (issue.sections as string[])
      .map((s: string) => `【${s}】\n${(sectionContents as Record<string, string>)[s] || ""}`)
      .join("\n\n");

    const prompt = `你是农业学术主编。请根据以下问题描述和修改建议，对论文相关内容进行定点修正。

【论文题目】${title}

【当前章节内容】
${relevantContent}

【发现的问题】
类型：${issue.type}
严重程度：${issue.severity}
描述：${issue.description}

【修改建议】
${issue.suggestion}

【要求】
1. 仅输出修正后的段落文本（完整的替换段落），不要输出解释、道歉、或"以下是修改后的版本"等元文字
2. 保持原文的学术风格、术语体系、Markdown 格式
3. 只修改与问题直接相关的部分，其他内容原样保留
4. 如果问题涉及多个章节，只输出最相关章节的修正内容
5. 用 [SECTION:章节名] 标记修正内容所属的章节`;

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
        } catch (error: any) {
          console.error("Fix error:", error);
          try { emit({ type: "error", error: error.message }); } catch {}
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
  } catch (error: any) {
    console.error("Fix API error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { TRANSLATE_SYSTEM_PROMPT, buildTranslateUserPrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLang = "zh" } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const userPrompt = buildTranslateUserPrompt(text, targetLang);

    const response = await callAI({
      provider,
      messages: [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

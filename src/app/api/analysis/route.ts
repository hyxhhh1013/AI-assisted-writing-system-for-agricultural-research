import { NextRequest } from "next/server";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildAnalysisPrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { dataSummary, researchDirection } = await req.json();

    if (!dataSummary || !researchDirection) {
      return new Response(JSON.stringify({ error: "Data summary and research direction are required" }), {
        status: 400,
      });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const contextChunks = await localRAG.search(researchDirection, 5);
    const contextText = contextChunks
      .map((c) => `[参考: ${formatRagCitation(c)}]\n${c.content}`)
      .join("\n\n");

    const prompt = buildAnalysisPrompt({ dataSummary, researchDirection, contextText });

    const response = await callAI({
      provider,
      messages: [
        { role: "system", content: prompt },
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

import { NextRequest } from "next/server";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import { buildAnalysisPrompt } from "@/lib/prompts";
import { analysisSchema } from "@/lib/validations";
import { validateBody } from "@/lib/api-validate";
import { errorResponse } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const validated = await validateBody(analysisSchema, await req.json());
    if (validated.errorResponse) return validated.errorResponse;
    if (!validated.data) return errorResponse("未知错误");

    const { dataSummary, researchDirection } = validated.data;
    const direction = researchDirection ?? dataSummary;

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return errorResponse(keyError);
    }

    const contextChunks = await localRAG.search(direction, 5);
    const contextText = contextChunks
      .map((c) => `[参考: ${formatRagCitation(c)}]\n${c.content}`)
      .join("\n\n");

    const prompt = buildAnalysisPrompt({ dataSummary, researchDirection: direction, contextText });

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
    return errorResponse(error.message);
  }
}

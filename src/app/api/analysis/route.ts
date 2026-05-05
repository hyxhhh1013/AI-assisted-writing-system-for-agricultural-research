import { NextRequest } from "next/server";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAIError, getStreamingResponse } from "@/lib/ai";
import { buildAnalysisPrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { dataSummary, researchDirection } = await req.json();

    if (!dataSummary || !researchDirection) {
      return new Response(JSON.stringify({ error: "Data summary and research direction are required" }), {
        status: 400,
      });
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const contextChunks = await localRAG.search(researchDirection, 5);
    const contextText = contextChunks
      .map((c) => `[参考: ${formatRagCitation(c)}]\n${c.content}`)
      .join("\n\n");

    const prompt = buildAnalysisPrompt({ dataSummary, researchDirection, contextText });

    const response = await callAI({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt },
      ],
    });

    return getStreamingResponse(response);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

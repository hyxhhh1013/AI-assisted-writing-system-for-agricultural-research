import { NextRequest } from "next/server";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { callAI, getAIError, getStreamingResponse } from "@/lib/ai";
import { buildOutlinePrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { title, researchDirection, language = "zh" } = await req.json();

    if (!title || !researchDirection) {
      return new Response(JSON.stringify({ error: "Title and Research Direction are required" }), {
        status: 400,
      });
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const contextChunks = await localRAG.search(`${title} ${researchDirection}`, 10);
    const contextText = contextChunks
      .map((c) => `[来自文献: ${formatRagCitation(c)}]\n${c.content}`)
      .join("\n\n");

    const systemPrompt = buildOutlinePrompt({ title, researchDirection, language, contextText });

    const response = await callAI({
      provider: "deepseek",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `论文题目：${title}\n研究方向：${researchDirection}` },
      ],
    });

    return getStreamingResponse(response);
  } catch (error: any) {
    console.error("Outline Generation Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
    });
  }
}

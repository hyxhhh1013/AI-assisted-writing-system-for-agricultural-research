import { NextRequest } from "next/server";
import { callAI, getAIError, getStreamingResponse } from "@/lib/ai";
import { TRANSLATE_SYSTEM_PROMPT, buildTranslateUserPrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLang = "zh" } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const userPrompt = buildTranslateUserPrompt(text, targetLang);

    const response = await callAI({
      provider: "deepseek",
      messages: [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    return getStreamingResponse(response);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

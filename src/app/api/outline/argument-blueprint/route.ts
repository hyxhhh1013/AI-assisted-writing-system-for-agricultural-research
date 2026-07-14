import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { argumentBlueprintGenerateSchema } from "@/lib/validations";
import { buildArgumentBlueprintPrompt } from "@/lib/prompts/argument-blueprint";
import { callAINonStreaming } from "@/lib/ai";
import { isArgumentBlueprint } from "@/contracts/argument-blueprint";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("未找到 JSON 对象");
  return JSON.parse(raw.slice(start, end + 1));
}

/** POST /api/outline/argument-blueprint — AI 生成论证蓝图（不落库） */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse } = await validateBody(
      argumentBlueprintGenerateSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const prompt = buildArgumentBlueprintPrompt({
      title: data.title,
      outline: data.outline,
      language: data.language ?? "zh",
      thesisHint: data.thesisHint,
      writingBlueprintThesis: data.writingBlueprintThesis,
    });

    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.4,
    });

    const parsed = extractJson(raw);
    if (!isArgumentBlueprint(parsed)) {
      return NextResponse.json({ error: "论证蓝图结构无效，请重试" }, { status: 422 });
    }

    return NextResponse.json({
      ...parsed,
      generatedAt: parsed.generatedAt || Date.now(),
      confirmedAt: undefined,
    });
  } catch (error: unknown) {
    logger.error("Argument-blueprint generate failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成失败" },
      { status: 500 },
    );
  }
}

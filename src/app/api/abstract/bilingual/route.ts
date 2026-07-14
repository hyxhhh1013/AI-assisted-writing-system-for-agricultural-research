import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { bilingualAbstractSchema } from "@/lib/validations";
import { buildBilingualAbstractPrompt } from "@/lib/prompts/abstract-bilingual";
import { callAINonStreaming } from "@/lib/ai";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("未找到 JSON 对象");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

/** POST /api/abstract/bilingual — 生成中英双语摘要 + 关键词 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse } = await validateBody(
      bilingualAbstractSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const prompt = buildBilingualAbstractPrompt({
      title: data.title,
      draftOrOutline: data.draftOrOutline,
      language: data.language ?? "zh",
      paperType: data.paperType,
    });

    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.5,
    });

    const parsed = extractJson(raw);
    const zh = typeof parsed.zh === "string" ? parsed.zh.trim() : "";
    const en = typeof parsed.en === "string" ? parsed.en.trim() : "";
    const keywordsZh = Array.isArray(parsed.keywordsZh)
      ? parsed.keywordsZh.filter((k): k is string => typeof k === "string")
      : [];
    const keywordsEn = Array.isArray(parsed.keywordsEn)
      ? parsed.keywordsEn.filter((k): k is string => typeof k === "string")
      : [];

    if (!zh || !en) {
      return NextResponse.json({ error: "摘要生成不完整，请重试" }, { status: 422 });
    }

    return NextResponse.json({ zh, en, keywordsZh, keywordsEn });
  } catch (error: unknown) {
    logger.error("Bilingual abstract failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成失败" },
      { status: 500 },
    );
  }
}

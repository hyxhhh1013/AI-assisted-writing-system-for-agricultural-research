import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { buildBlueprintPrompt } from "@/lib/prompts/blueprint";
import { validateBody } from "@/lib/api-validate";
import { blueprintSchema, writingBlueprintPayloadSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("无法解析 AI 返回的 JSON");
  }
}

function normalizeBlueprint(data: WritingBlueprint): WritingBlueprint {
  const items = data.figurePlan.items.map((item, index) => ({
    ...item,
    id: item.id?.trim() || `fig-${index + 1}`,
  }));
  const totalMin = Math.max(data.figurePlan.totalMin, 0);
  const totalMax = Math.max(data.figurePlan.totalMax, totalMin);
  return {
    ...data,
    version: 1,
    generatedAt: Date.now(),
    figurePlan: {
      totalMin,
      totalMax,
      items,
    },
  };
}

/** POST /api/outline/blueprint — 基于大纲生成写作蓝图（JSON） */
export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(blueprintSchema, await req.json());
    if (ve) return ve;

    const { title, outline, researchDirection, language, projectMode } = data;
    const direction = (researchDirection?.trim() || title.trim());
    if (!outline.trim()) {
      return NextResponse.json({ error: "请先生成或填写大纲" }, { status: 400 });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 500 });
    }

    const systemPrompt = buildBlueprintPrompt({
      title,
      researchDirection: direction,
      outline,
      language,
      projectMode: projectMode ?? "review",
    });

    const response = await callAI({
      provider,
      messages: [
        {
          role: "system",
          content:
            "你是学术论文规划助手。严格只输出 JSON 对象，不要 markdown 围栏或解释文字。generatedAt 填 0 即可。",
        },
        { role: "user", content: systemPrompt },
      ],
      stream: false,
    });

    const rawJson = await response.json();
    const rawText: string = rawJson?.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) {
      return NextResponse.json({ error: "AI 未返回有效内容" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(rawText);
    } catch (parseErr: unknown) {
      logger.error("Blueprint JSON parse error:", parseErr);
      return NextResponse.json(
        { error: "蓝图格式解析失败，请重试" },
        { status: 502 },
      );
    }

    const validated = writingBlueprintPayloadSchema.safeParse(parsed);
    if (!validated.success) {
      logger.error("Blueprint validation error:", validated.error.flatten());
      return NextResponse.json(
        { error: "蓝图结构不完整，请重试" },
        { status: 502 },
      );
    }

    const blueprint = normalizeBlueprint(validated.data as WritingBlueprint);
    return NextResponse.json(blueprint);
  } catch (error: unknown) {
    logger.error("Blueprint Generation Error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Internal Server Error" },
      { status: 500 },
    );
  }
}

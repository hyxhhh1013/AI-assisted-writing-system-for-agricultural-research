import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { buildArgumentBlueprintPrompt } from "@/lib/prompts/argument-blueprint";
import { validateBody } from "@/lib/api-validate";
import {
  argumentBlueprintPayloadSchema,
  argumentBlueprintSchema,
} from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";
import { computeOutlineHash } from "@/lib/blueprint-utils";
import { writeArgumentBlueprint } from "@/lib/project-argument-blueprint-db";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { serializeArgumentBlueprint } from "@/contracts/argument-blueprint";

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

function normalizeArgumentBlueprint(
  data: ArgumentBlueprint,
  outline: string,
): ArgumentBlueprint {
  return {
    ...data,
    version: 1,
    chains: data.chains.map((c, i) => ({
      ...c,
      id: c.id?.trim() || `c${i + 1}`,
    })),
    rebuttals: data.rebuttals.map((r, i) => ({
      ...r,
      id: r.id?.trim() || `r${i + 1}`,
    })),
    gaps: data.gaps ?? [],
    outlineHash: computeOutlineHash(outline),
    generatedAt: Date.now(),
  };
}

/** POST /api/outline/argument-blueprint — 基于大纲生成论证蓝图 */
export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(
      argumentBlueprintSchema,
      await req.json(),
    );
    if (ve) return ve;

    const {
      title,
      outline,
      researchDirection,
      language,
      projectMode,
      thesisHint,
      projectId,
    } = data;

    if (!outline.trim()) {
      return NextResponse.json({ error: "请先生成或填写大纲" }, { status: 400 });
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 500 });
    }

    const systemPrompt = buildArgumentBlueprintPrompt({
      title,
      researchDirection: (researchDirection?.trim() || title.trim()),
      outline,
      language: language ?? "zh",
      projectMode,
      thesisHint,
    });

    const response = await callAI({
      provider,
      messages: [
        {
          role: "system",
          content:
            "你是学术论证顾问。严格只输出 JSON 对象，不要 markdown 围栏或解释文字。generatedAt 填 0 即可。",
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
      logger.error("Argument blueprint JSON parse error:", parseErr);
      return NextResponse.json(
        { error: "论证蓝图格式解析失败，请重试" },
        { status: 502 },
      );
    }

    const checked = argumentBlueprintPayloadSchema.safeParse(parsed);
    if (!checked.success) {
      logger.warn("argument blueprint schema fail", checked.error.flatten());
      return NextResponse.json(
        { error: "AI 返回的论证蓝图格式无效，请重试" },
        { status: 502 },
      );
    }

    const blueprint = normalizeArgumentBlueprint(
      {
        ...checked.data,
        generatedAt: checked.data.generatedAt ?? Date.now(),
      } as ArgumentBlueprint,
      outline,
    );

    if (projectId?.trim()) {
      try {
        await writeArgumentBlueprint(
          projectId.trim(),
          serializeArgumentBlueprint(blueprint),
        );
        await syncProjectPaperPassport(projectId.trim());
      } catch (err) {
        logger.warn("argument blueprint persist skipped", err);
      }
    }

    return NextResponse.json(blueprint);
  } catch (error: unknown) {
    logger.error("argument-blueprint POST", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

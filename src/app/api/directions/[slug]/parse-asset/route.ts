import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { callAINonStreaming } from "@/lib/ai";
import { buildNLParsePrompt } from "@/lib/prompts/direction-nl-parse";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import type { ExperimentAsset } from "@/contracts/direction";

export const dynamic = "force-dynamic";

function parseAIJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* continue */ }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1]) as T;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("无法解析 AI 返回结果");
}

/**
 * POST /api/directions/[slug]/parse-asset
 * 将自然语言描述解析为结构化 ExperimentAsset
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const freeText = body.text as string | undefined;

    if (!freeText || freeText.trim().length < 10) {
      return NextResponse.json(
        { error: "请提供至少 10 个字的实验描述" },
        { status: 400 },
      );
    }

    const direction = await prisma.direction.findUnique({ where: { slug } });
    if (!direction) {
      return NextResponse.json({ error: "方向不存在" }, { status: 404 });
    }

    const existingAssets = Array.isArray(direction.assets)
      ? (direction.assets as unknown as Array<{ kind?: string; title?: string }>)
      : [];
    const existingTitles = existingAssets
      .filter((a) => a.kind === "experiment")
      .map((a) => a.title || "")
      .filter(Boolean);

    const prompt = buildNLParsePrompt(freeText.trim(), existingTitles);

    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      timeoutMs: 30_000,
    });

    const result = parseAIJson<{
      title: string;
      dateRange: string;
      researchQuestion: string;
      methods: string;
      keyFindings: string;
      limitations: string;
      isNegativeResult: boolean;
      confidence: "high" | "medium" | "low";
    }>(raw);

    const now = Date.now();
    const parsed: ExperimentAsset = {
      id: `exp-${now}`,
      kind: "experiment",
      title: result.title || "未命名实验",
      dateRange: result.dateRange || "",
      researchQuestion: result.researchQuestion || "",
      methods: result.methods || "",
      keyFindings: result.keyFindings || "",
      limitations: result.limitations || "",
      isNegativeResult: result.isNegativeResult || false,
      linkedDatasets: [],
      linkedPapers: [],
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json({
      parsed,
      confidence: result.confidence || "medium",
      originalText: freeText.trim(),
    });
  } catch (error: unknown) {
    logger.fail("nl parse asset failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "解析失败" },
      { status: 500 },
    );
  }
}

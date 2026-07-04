import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { evaluationContractSchema } from "@/lib/validations";
import { callAINonStreaming } from "@/lib/ai";
import { buildEvaluationContractPrompt } from "@/lib/prompts/direction";
import { buildSocraticToRubricPrompt } from "@/lib/prompts/direction-socratic";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/directions/[slug]/evaluation-contract
 *
 * 预承诺阶段：AI 基于方向名称+描述（不看资产）生成 8 维度评价标准草案。
 * 用户确认/修改后提交最终版本。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();

    const direction = await prisma.direction.findUnique({ where: { slug } });
    if (!direction) {
      return NextResponse.json({ error: "方向不存在" }, { status: 404 });
    }

    const action = body.action as string | undefined;

    // 模式 0：Socratic Mentor — 基于 Q&A 生成 Rubrics（不看资产）
    if (action === "socratic-draft") {
      const qa = body.qa as Array<{ questionId: string; question: string; answer: string }> | undefined;
      if (!qa || !Array.isArray(qa) || qa.length === 0) {
        return NextResponse.json(
          { error: "请提供至少 1 组问答" },
          { status: 400 },
        );
      }

      const prompt = buildSocraticToRubricPrompt({
        directionName: direction.name,
        directionDesc: direction.description,
        qa: qa.map((item) => ({ question: item.question, answer: item.answer })),
      });

      const raw = await callAINonStreaming({
        provider: "deepseek",
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        timeoutMs: 60_000,
      });

      let draft;
      try {
        draft = JSON.parse(raw);
        const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) draft = JSON.parse(fenceMatch[1]);
      } catch {
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          draft = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        } else {
          return NextResponse.json(
            { error: "AI 返回格式异常，请重试", raw: raw.slice(0, 500) },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({
        draft: draft.dimensions || draft,
        rationale: (draft as { rationale?: string }).rationale || "",
        generatedAt: Date.now(),
      });
    }

    // 模式 1：AI 生成评价标准草案（不看资产，通用版）
    if (action === "draft") {
      const prompt = buildEvaluationContractPrompt(direction.name, direction.description);

      const raw = await callAINonStreaming({
        provider: "deepseek",
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        timeoutMs: 30_000,
      });

      let draft;
      try {
        draft = JSON.parse(raw);
        // 清理可能的 code fence
        const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) {
          draft = JSON.parse(fenceMatch[1]);
        }
      } catch {
        // 尝试提取 JSON
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          draft = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        } else {
          return NextResponse.json(
            { error: "AI 返回格式异常，请重试", raw: raw.slice(0, 500) },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({
        draft: draft.dimensions || draft,
        generatedAt: Date.now(),
      });
    }

    // 模式 2：用户提交确认的评价标准（保存到 direction）
    const { data: parsed, errorResponse } = await validateBody(
      evaluationContractSchema,
      body,
    );
    if (errorResponse) return errorResponse;

    // 将确认的评价标准合并到 direction.description 的扩展字段
    // 实际存储策略：追加到 direction 的 analysis JSON 中作为 evaluationContract
    const currentAnalysis = (direction.analysis as Record<string, unknown> | null) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
      evaluationContract: {
        dimensions: parsed.dimensions,
        confirmedAt: Date.now(),
      },
    };

    const cleanAnalysis = JSON.parse(JSON.stringify(updatedAnalysis));
    await prisma.direction.update({
      where: { slug },
      data: { analysis: cleanAnalysis as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({
      message: "评价标准已确认",
      evaluationContract: parsed.dimensions,
    });
  } catch (error: unknown) {
    logger.fail("evaluation-contract failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成评价标准失败" },
      { status: 500 },
    );
  }
}

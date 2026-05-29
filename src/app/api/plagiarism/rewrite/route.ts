import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateRewriteSuggestions } from "@/services/rewrite-service";
import { validateBody } from "@/lib/api-validate";
import { plagiarismRewriteSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(plagiarismRewriteSchema, await req.json());
    if (ve) return ve;

    const { checkId, matchId, originalText, contextText } = data;

    // 尝试获取项目的研究方向
    let researchDirection: string | undefined;
    if (checkId) {
      const check = await prisma.plagiarismCheck.findUnique({
        where: { id: checkId },
        select: { project: { select: { researchDirection: true } } },
      });
      researchDirection = check?.project?.researchDirection ?? undefined;
    }

    const suggestions = await generateRewriteSuggestions({
      checkId,
      matchId,
      originalText,
      contextText,
      researchDirection,
    });

    return Response.json({ suggestions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "生成改写建议失败";
    logger.error("[Rewrite]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** 接受/拒绝改写建议 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { suggestionId, status } = body;

    if (!suggestionId || !["accepted", "rejected"].includes(status)) {
      return Response.json(
        { error: "suggestionId and status(accepted|rejected) required" },
        { status: 400 }
      );
    }

    await prisma.rewriteSuggestion.update({
      where: { id: suggestionId },
      data: { status },
    });

    return Response.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "操作失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

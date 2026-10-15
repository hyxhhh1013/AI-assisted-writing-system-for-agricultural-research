import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

const log = createLogger("api/plagiarism/rewrite");
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateRewriteSuggestions } from "@/services/rewrite-service";
import { validateBody } from "@/lib/api-validate";
import { plagiarismRewriteSchema, plagiarismRewritePatchSchema } from "@/lib/validations";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  assertPlagiarismCheckOwnedByUser,
  assertRewriteSuggestionOwnedByUser,
} from "@/lib/plagiarism-access";

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return Response.json({ error: "未登录，请先登录" }, { status: 401 });
    }

    const { data, errorResponse: ve } = await validateBody(plagiarismRewriteSchema, await req.json());
    if (ve) return ve;

    const { checkId, matchId, originalText, contextText } = data;

    const owned = await assertPlagiarismCheckOwnedByUser(checkId, userId);
    if (!owned) {
      return Response.json({ error: "查重记录不存在或无权访问" }, { status: 403 });
    }

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

    return Response.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        strategy: s.strategy,
        suggestedText: s.suggestedText,
        similarityAfter: s.similarityAfter,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "生成改写建议失败";
    log.fail("rewrite suggestions failed", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** 接受/拒绝改写建议 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return Response.json({ error: "未登录，请先登录" }, { status: 401 });
    }

    const { data, errorResponse: ve } = await validateBody(plagiarismRewritePatchSchema, await req.json());
    if (ve) return ve;

    const { suggestionId, status } = data;

    const owned = await assertRewriteSuggestionOwnedByUser(suggestionId, userId);
    if (!owned) {
      return Response.json({ error: "改写建议不存在或无权访问" }, { status: 403 });
    }

    await prisma.rewriteSuggestion.update({
      where: { id: suggestionId },
      data: { status },
    });

    return Response.json({ ok: true });
  } catch (error: unknown) {
    log.fail("rewrite suggestion patch failed", error);
    const message = error instanceof Error ? getErrorMessage(error) : "操作失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

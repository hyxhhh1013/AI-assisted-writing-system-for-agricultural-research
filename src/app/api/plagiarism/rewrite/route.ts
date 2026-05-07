import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { generateRewriteSuggestions } from "@/services/rewrite-service";

export async function POST(req: NextRequest) {
  try {
    const { checkId, matchId, originalText, contextText } = await req.json();

    if (!checkId || !originalText) {
      return Response.json({ error: "checkId and originalText are required" }, { status: 400 });
    }

    const suggestions = await generateRewriteSuggestions({
      checkId,
      matchId,
      originalText,
      contextText,
    });

    return Response.json({ suggestions });
  } catch (error: any) {
    console.error("[Rewrite]", error);
    return Response.json({ error: error.message || "生成改写建议失败" }, { status: 500 });
  }
}

/** 接受/拒绝改写建议 */
export async function PATCH(req: NextRequest) {
  try {
    const { suggestionId, status } = await req.json();
    if (!suggestionId || !["accepted", "rejected"].includes(status)) {
      return Response.json({ error: "suggestionId and status(accepted|rejected) required" }, { status: 400 });
    }

    await prisma.rewriteSuggestion.update({
      where: { id: suggestionId },
      data: { status },
    });

    return Response.json({ ok: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

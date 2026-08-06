import { NextRequest, NextResponse } from "next/server";
import { buildPaperBrief } from "@/lib/direction-writing-bridge";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/directions/[slug]/paper-brief?candidateId=xxx
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    const candidateId = req.nextUrl.searchParams.get("candidateId") || undefined;

    const brief = await buildPaperBrief({
      directionSlug: slug,
      candidateId,
      userId: owned.userId,
    });

    return NextResponse.json(brief);
  } catch (error: unknown) {
    logger.fail("paper-brief generation failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成论文简报失败" },
      { status: 500 },
    );
  }
}

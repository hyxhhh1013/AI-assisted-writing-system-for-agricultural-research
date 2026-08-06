import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";
import { matchXrdPhases } from "@/lib/xrd-phase-match";
import { validateBody } from "@/lib/api-validate";
import { xrdPhaseSearchSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * XRD 相检索（内置参考相库加权峰匹配）
 * POST /api/xrd/phase-search
 * Body: JSON { peaks: [{two_theta, intensity?, relative_intensity?}], tolerance_deg?, top_k? }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const { data: body, errorResponse: ve } = await validateBody(xrdPhaseSearchSchema, rawBody);
    if (ve) return ve;

    const matches = matchXrdPhases(body.peaks, {
      tolerance_deg: body.tolerance_deg,
      top_k: body.top_k,
      min_score: body.min_score,
    });

    return NextResponse.json({
      data: {
        n_input_peaks: body.peaks.length,
        n_matches: matches.length,
        matches,
      },
    });
  } catch (error: unknown) {
    logger.error("XRD phase-search API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "相检索失败" },
      { status: 500 },
    );
  }
}

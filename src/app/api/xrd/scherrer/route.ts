import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { xrdScherrerSchema } from "@/lib/validations";
import { runScherrerGeneration } from "@/lib/xrd-scherrer-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scherrer 晶粒尺寸
 * POST /api/xrd/scherrer
 * Body: JSON { peaks, wavelength?, shape_factor?, fwhm_unit?, title? }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const { data: body, errorResponse: ve } = await validateBody(xrdScherrerSchema, rawBody);
    if (ve) return ve;

    const result = await runScherrerGeneration(body);
    return NextResponse.json({
      imageBase64: result.imageBase64,
      imageUrl: result.imageUrl,
      data: result.data,
    });
  } catch (error: unknown) {
    logger.error("XRD scherrer API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "计算失败" },
      { status: 500 },
    );
  }
}

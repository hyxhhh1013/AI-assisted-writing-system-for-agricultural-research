import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { errorResponse, successResponse, unauthorizedResponse } from "@/lib/api-response";
import { getUserIdFromRequest } from "@/lib/auth";
import { getErrorMessage } from "@/lib/error-utils";
import { runMechanismIllustration } from "@/lib/illustration-runner";
import { illustrateMechanismSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 机理结构图 → 即梦 Seedream 观感候选（智谱备选）。不写入正文。
 * POST /api/illustrate-mechanism
 */
export async function POST(req: NextRequest) {
  if (!getUserIdFromRequest(req)) return unauthorizedResponse();

  try {
    const body: unknown = await req.json();
    const { data, errorResponse: ve } = await validateBody(illustrateMechanismSchema, body);
    if (ve) return ve;

    const result = await runMechanismIllustration(data);
    return successResponse(result);
  } catch (err) {
    return errorResponse(getErrorMessage(err), 500);
  }
}

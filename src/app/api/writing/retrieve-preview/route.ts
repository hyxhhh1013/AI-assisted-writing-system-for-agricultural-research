import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { successResponse, errorResponse } from "@/lib/api-response";
import { retrievePreviewSchema } from "@/lib/validations";
import { retrieveWritingPreview } from "@/services/writing-context";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

const log = createLogger("api/writing/retrieve-preview");

export const runtime = "nodejs";
/** RAG 全库加载可能较慢 */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(retrievePreviewSchema, await req.json());
    if (ve) return ve;

    const preview = await retrieveWritingPreview({
      title: data.title,
      section: data.section,
      context: data.context,
      bullets: data.bullets,
      language: data.language,
      existingReferences: data.existingReferences,
      researchDirection: data.researchDirection,
      retrievalMode: data.retrievalMode,
      projectMode: data.projectMode,
    });

    return successResponse(preview);
  } catch (error: unknown) {
    log.fail("retrieve-preview failed", error);
    return errorResponse(getErrorMessage(error));
  }
}

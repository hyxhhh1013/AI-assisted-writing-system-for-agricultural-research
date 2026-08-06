import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionLiteratureImportExternalSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import {
  externalHitToCorpusEntry,
  patchDirectionLiteratureCorpus,
} from "@/lib/direction-literature-corpus";
import type { ExternalLiteratureHit } from "@/contracts/literature";

/** POST /api/directions/[slug]/literature-corpus/import-external */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { data, errorResponse } = await validateBody(
      directionLiteratureImportExternalSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    const entry = externalHitToCorpusEntry(
      data.hit as ExternalLiteratureHit,
      data.role ?? "supporting",
    );
    await patchDirectionLiteratureCorpus(owned.direction.id, [{ op: "upsert", entry }]);

    const row = await prisma.direction.findUniqueOrThrow({
      where: { id: owned.direction.id },
    });

    return NextResponse.json({ entry, direction: prismaRowToDirectionDTO(row) });
  } catch (error: unknown) {
    logger.fail("direction literature import-external failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "导入外部文献失败" },
      { status: 500 },
    );
  }
}

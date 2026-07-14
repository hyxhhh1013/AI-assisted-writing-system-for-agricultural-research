import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionLiteratureCorpusPatchSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import { patchDirectionLiteratureCorpus } from "@/lib/direction-literature-corpus";

/** PATCH /api/directions/[slug]/literature-corpus — 增量更新文献 corpus */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { data: parsed, errorResponse } = await validateBody(
      directionLiteratureCorpusPatchSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    await patchDirectionLiteratureCorpus(owned.direction.id, parsed.ops);

    const row = await prisma.direction.findUniqueOrThrow({
      where: { id: owned.direction.id },
    });

    return NextResponse.json(prismaRowToDirectionDTO(row));
  } catch (error: unknown) {
    logger.fail("direction literature-corpus PATCH failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "更新文献 corpus 失败" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionLiteratureImportKnowledgeSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import {
  knowledgePdfToCorpusEntry,
  patchDirectionLiteratureCorpus,
} from "@/lib/direction-literature-corpus";

/** POST /api/directions/[slug]/literature-corpus/import-knowledge */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { data, errorResponse } = await validateBody(
      directionLiteratureImportKnowledgeSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    const entry = knowledgePdfToCorpusEntry(
      data.fileName,
      data.citation,
      data.role ?? "supporting",
    );
    await patchDirectionLiteratureCorpus(owned.direction.id, [{ op: "upsert", entry }]);

    const row = await prisma.direction.findUniqueOrThrow({
      where: { id: owned.direction.id },
    });

    return NextResponse.json({ entry, direction: prismaRowToDirectionDTO(row) });
  } catch (error: unknown) {
    logger.fail("direction literature import-knowledge failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "导入知识库文献失败" },
      { status: 500 },
    );
  }
}

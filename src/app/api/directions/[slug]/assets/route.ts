import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionAssetsPatchSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import { patchDirectionAssetsLocked } from "@/lib/direction-assets";

// ====== PATCH 增量资产更新 ======

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { data: parsed, errorResponse } = await validateBody(
      directionAssetsPatchSchema,
      body,
    );
    if (errorResponse) return errorResponse;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    await patchDirectionAssetsLocked(direction.id, parsed.ops);

    const row = await prisma.direction.findUniqueOrThrow({
      where: { id: direction.id },
    });

    const dto = prismaRowToDirectionDTO({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      categories: row.categories,
      status: row.status,
      assets: row.assets,
      analysis: row.analysis,
      roadmap: row.roadmap,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    return NextResponse.json(dto);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message.includes("必须包含 id 和 kind")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logger.fail("direction assets PATCH failed", error);
    return NextResponse.json(
      { error: message || "更新资产失败" },
      { status: 500 },
    );
  }
}

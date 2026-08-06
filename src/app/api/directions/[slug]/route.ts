import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionUpdateSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import type { DirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";

// ====== GET 单个方向 ======

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const row = owned.direction;

    const dto: DirectionDTO = prismaRowToDirectionDTO({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      categories: row.categories,
      status: row.status,
      assets: row.assets,
      literatureCorpus: row.literatureCorpus,
      analysis: row.analysis,
      roadmap: row.roadmap,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const categories = (row.categories as string[]) || [];
    if (categories.length > 0) {
      dto.literatureCount = await prisma.knowledgeFile.count({
        where: { category: { in: categories } },
      });
    }

    return NextResponse.json(dto);
  } catch (error: unknown) {
    logger.fail("direction get failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "获取方向失败" },
      { status: 500 },
    );
  }
}

// ====== PUT 更新 ======

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    const body = await req.json();
    const { data: parsed, errorResponse } = await validateBody(directionUpdateSchema, body);
    if (errorResponse) return errorResponse;

    const row = await prisma.direction.update({
      where: { id: owned.direction.id },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.categories !== undefined && { categories: parsed.categories }),
        ...(parsed.status !== undefined && { status: parsed.status }),
      },
    });

    const dto: DirectionDTO = prismaRowToDirectionDTO({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      categories: row.categories,
      status: row.status,
      assets: row.assets,
      literatureCorpus: row.literatureCorpus,
      analysis: row.analysis,
      roadmap: row.roadmap,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    return NextResponse.json(dto);
  } catch (error: unknown) {
    logger.fail("direction update failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "更新方向失败" },
      { status: 500 },
    );
  }
}

// ====== DELETE ======

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;

    await prisma.direction.delete({ where: { id: owned.direction.id } });

    return NextResponse.json({ message: "方向已删除" });
  } catch (error: unknown) {
    logger.fail("direction delete failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "删除方向失败" },
      { status: 500 },
    );
  }
}

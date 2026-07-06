import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionCreateSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO, directionDTOToListItems } from "@/contracts/direction";
import type { DirectionDTO } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireDirectionUser } from "@/lib/direction-auth";

// ====== GET 列表 ======

export async function GET(req: NextRequest) {
  try {
    const auth = requireDirectionUser(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "active";
    const query = searchParams.get("q")?.toLowerCase();

    const where: Record<string, unknown> = { userId: auth.userId };
    if (status !== "all") where.status = status;
    if (query) {
      where.OR = [
        { name: { contains: query } },
        { description: { contains: query } },
        { slug: { contains: query } },
      ];
    }

    const rows = await prisma.direction.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const dtos: DirectionDTO[] = rows.map((r) =>
      prismaRowToDirectionDTO({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        categories: r.categories,
        status: r.status,
        assets: r.assets,
        analysis: r.analysis,
        roadmap: r.roadmap,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }),
    );

    return NextResponse.json({
      items: directionDTOToListItems(dtos),
      total: dtos.length,
    });
  } catch (error: unknown) {
    logger.fail("direction list GET failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "获取方向列表失败" },
      { status: 500 },
    );
  }
}

// ====== POST 创建 ======

export async function POST(req: NextRequest) {
  try {
    const auth = requireDirectionUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { data: parsed, errorResponse } = await validateBody(directionCreateSchema, body);
    if (errorResponse) return errorResponse;

    const existing = await prisma.direction.findUnique({
      where: { slug: parsed.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: `URL 标识 "${parsed.slug}" 已被使用` },
        { status: 409 },
      );
    }

    const row = await prisma.direction.create({
      data: {
        slug: parsed.slug,
        name: parsed.name,
        description: parsed.description || "",
        categories: parsed.categories,
        status: parsed.status || "active",
        assets: [],
        userId: auth.userId,
      },
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

    return NextResponse.json(dto, { status: 201 });
  } catch (error: unknown) {
    logger.fail("direction create failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "创建方向失败" },
      { status: 500 },
    );
  }
}

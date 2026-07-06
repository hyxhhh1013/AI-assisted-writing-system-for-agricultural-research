import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionAssetsPatchSchema } from "@/lib/validations";
import { prismaRowToDirectionDTO } from "@/contracts/direction";
import type { DirectionAsset } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";

/** 将 Prisma Json 字段安全转换为资产数组 */
function jsonToAssets(value: unknown): DirectionAsset[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as DirectionAsset[];
}

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

    const currentAssets = jsonToAssets(direction.assets);
    let updatedAssets = [...currentAssets];

    for (const op of parsed.ops) {
      if (op.op === "delete" && op.assetId) {
        updatedAssets = updatedAssets.filter((a) => a.id !== op.assetId);
      } else if (op.op === "upsert" && op.asset) {
        const asset = op.asset as unknown as DirectionAsset;
        if (!asset.id || !asset.kind) {
          return NextResponse.json(
            { error: "每条资产必须包含 id 和 kind 字段" },
            { status: 400 },
          );
        }
        const idx = updatedAssets.findIndex((a) => a.id === asset.id);
        const now = Date.now();
        const stamped = {
          ...asset,
          createdAt: idx >= 0 ? updatedAssets[idx].createdAt : now,
          updatedAt: now,
        };
        if (idx >= 0) {
          updatedAssets[idx] = stamped;
        } else {
          updatedAssets.push(stamped);
        }
      }
    }

    const cleanAssets = JSON.parse(JSON.stringify(updatedAssets));
    const row = await prisma.direction.update({
      where: { id: direction.id },
      data: { assets: cleanAssets as unknown as Prisma.InputJsonValue },
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
    logger.fail("direction assets PATCH failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "更新资产失败" },
      { status: 500 },
    );
  }
}

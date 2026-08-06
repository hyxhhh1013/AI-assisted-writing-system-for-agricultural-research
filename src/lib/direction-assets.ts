import type { Prisma } from "@prisma/client";
import type { DirectionAsset } from "@/contracts/direction";
import type { DirectionAssetsPatchInput } from "@/lib/validations";
import prisma from "@/lib/prisma";

/** 将 Prisma Json 字段安全转换为资产数组 */
export function jsonToDirectionAssets(value: unknown): DirectionAsset[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as DirectionAsset[];
}

/** 纯函数：对资产数组应用增量 ops（供单测与事务内复用） */
export function applyDirectionAssetPatchOps(
  currentAssets: DirectionAsset[],
  ops: DirectionAssetsPatchInput["ops"],
): DirectionAsset[] {
  let updatedAssets = [...currentAssets];

  for (const op of ops) {
    if (op.op === "delete" && op.assetId) {
      updatedAssets = updatedAssets.filter((a) => a.id !== op.assetId);
    } else if (op.op === "upsert" && op.asset) {
      const asset = op.asset as unknown as DirectionAsset;
      if (!asset.id || !asset.kind) {
        throw new Error("每条资产必须包含 id 和 kind 字段");
      }
      const idx = updatedAssets.findIndex((a) => a.id === asset.id);
      const now = Date.now();
      const stamped: DirectionAsset = {
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

  return updatedAssets;
}

/** 行锁 + 事务内读改写 Direction.assets */
export async function patchDirectionAssetsLocked(
  directionId: string,
  ops: DirectionAssetsPatchInput["ops"],
): Promise<DirectionAsset[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ assets: unknown }>>`
      SELECT assets FROM "Direction" WHERE id = ${directionId} FOR UPDATE
    `;
    if (!rows[0]) {
      throw new Error("方向不存在");
    }

    const updatedAssets = applyDirectionAssetPatchOps(
      jsonToDirectionAssets(rows[0].assets),
      ops,
    );
    const cleanAssets = JSON.parse(JSON.stringify(updatedAssets)) as DirectionAsset[];

    await tx.direction.update({
      where: { id: directionId },
      data: { assets: cleanAssets as unknown as Prisma.InputJsonValue },
    });

    return updatedAssets;
  });
}

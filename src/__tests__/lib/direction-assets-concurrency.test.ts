import { describe, expect, it } from "vitest";
import {
  applyDirectionAssetPatchOps,
} from "@/lib/direction-assets";
import type { DirectionAssetsPatchInput } from "@/lib/validations";
import type { DirectionAsset } from "@/contracts/direction";

function upsertOp(asset: DirectionAsset): DirectionAssetsPatchInput["ops"][number] {
  return { op: "upsert", asset: asset as unknown as Record<string, unknown> };
}

function makeAsset(id: string): DirectionAsset {
  return {
    id,
    kind: "experiment",
    title: `Asset ${id}`,
    dateRange: "2024",
    researchQuestion: "Q",
    methods: "M",
    keyFindings: "F",
    limitations: "L",
    isNegativeResult: false,
    linkedDatasets: [],
    linkedPapers: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("direction assets patch ops", () => {
  it("upserts and deletes assets in memory", () => {
    const first = applyDirectionAssetPatchOps([], [upsertOp(makeAsset("a"))]);
    expect(first).toHaveLength(1);

    const second = applyDirectionAssetPatchOps(first, [
      upsertOp({ ...makeAsset("b"), title: "B" }),
      { op: "delete", assetId: "a" },
    ]);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe("b");
  });

  it("serial locked-style merges preserve all concurrent upserts", () => {
    let assets: DirectionAsset[] = [];
    for (let i = 0; i < 10; i++) {
      assets = applyDirectionAssetPatchOps(assets, [upsertOp(makeAsset(`asset-${i}`))]);
    }
    expect(assets).toHaveLength(10);
  });

  it("demonstrates lost update when two ops read the same snapshot", () => {
    const base: DirectionAsset[] = [];
    const branchA = applyDirectionAssetPatchOps(base, [upsertOp(makeAsset("a"))]);
    const branchB = applyDirectionAssetPatchOps(base, [upsertOp(makeAsset("b"))]);
    expect(branchA).toHaveLength(1);
    expect(branchB).toHaveLength(1);

    const merged = applyDirectionAssetPatchOps(
      applyDirectionAssetPatchOps(base, [upsertOp(makeAsset("a"))]),
      [upsertOp(makeAsset("b"))],
    );
    expect(merged).toHaveLength(2);
  });
});

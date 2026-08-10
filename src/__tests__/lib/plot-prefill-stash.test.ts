import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  plotPrefillStorageKey,
  stashPlotPrefill,
  takePlotPrefill,
} from "@/lib/plot-prefill-stash";

describe("plot-prefill-stash", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    // 精修链 target=_blank：须用 localStorage（跨标签共享），不能用 sessionStorage
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stashes and takes by chartAssetId then clears", () => {
    stashPlotPrefill({
      figureSpecEnc: "enc-abc",
      chartAssetId: "asset-1",
      imageUrl: "/api/charts/a.png",
      projectId: "p1",
    });
    expect(plotPrefillStorageKey({ chartAssetId: "asset-1" })).toContain("asset-1");
    expect(takePlotPrefill({ chartAssetId: "asset-1" })).toBe("enc-abc");
    expect(takePlotPrefill({ chartAssetId: "asset-1" })).toBeNull();
  });

  it("falls back to imageUrl key", () => {
    stashPlotPrefill({
      figureSpecEnc: "enc-img",
      imageUrl: "/api/charts/b.png",
    });
    expect(takePlotPrefill({ imageUrl: "/api/charts/b.png" })).toBe("enc-img");
  });
});

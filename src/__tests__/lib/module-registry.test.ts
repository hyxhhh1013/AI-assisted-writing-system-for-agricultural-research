import { describe, expect, it, vi, afterEach } from "vitest";

describe("module-registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lists home modules in order", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHART", "true");
    const { listModules } = await import("@/lib/module-registry");
    const home = listModules({ placement: "home" });
    expect(home.length).toBeGreaterThanOrEqual(6);
    expect(home[0]?.id).toBe("workbench");
    for (let i = 1; i < home.length; i += 1) {
      expect(home[i]!.order).toBeGreaterThanOrEqual(home[i - 1]!.order);
    }
  });

  it("hides chart module when NEXT_PUBLIC_ENABLE_CHART=false", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHART", "false");
    const { listModules } = await import("@/lib/module-registry");
    const home = listModules({ placement: "home" });
    const sidebar = listModules({ placement: "workbench-sidebar" });

    expect(home.some((m) => m.id === "plot")).toBe(false);
    expect(sidebar.some((m) => m.id === "plot")).toBe(false);
  });

  it("does not put plot on the workbench sidebar (精修不走主栏)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_CHART", "true");
    const { listModules } = await import("@/lib/module-registry");
    const sidebar = listModules({ placement: "workbench-sidebar" });
    expect(sidebar.some((m) => m.id === "plot")).toBe(false);
  });

  it("appends project id for modules that require it", async () => {
    const { getModuleById, getModuleHref } = await import("@/lib/module-registry");
    const plot = getModuleById("plot");
    expect(plot).toBeDefined();
    expect(getModuleHref(plot!, "proj-1")).toBe("/plot?id=proj-1");
    expect(getModuleHref(plot!, null)).toBe("/plot");
  });

  it("keeps modules without flags always enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_WRITING", "false");
    const { getModuleById, listModules } = await import("@/lib/module-registry");
    const guide = getModuleById("guide");
    expect(guide?.flag).toBeNull();
    expect(listModules({ placement: "home" }).some((m) => m.id === "guide")).toBe(true);
    expect(getModuleById("directions")?.href).toBe("/directions");
  });

  it("registers every module with unique id", async () => {
    const { APP_MODULES } = await import("@/lib/module-registry");
    const ids = APP_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

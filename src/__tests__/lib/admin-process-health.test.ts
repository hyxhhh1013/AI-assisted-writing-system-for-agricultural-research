import { describe, expect, it } from "vitest";
import { collectNodeMemory, parsePm2App } from "@/lib/admin-process-health";

describe("admin-process-health", () => {
  it("reports node heap numbers", () => {
    const mem = collectNodeMemory();
    expect(mem.heapUsedMB).toBeGreaterThan(0);
    expect(mem.heapTotalMB).toBeGreaterThanOrEqual(mem.heapUsedMB);
    expect(mem.rssMB).toBeGreaterThan(0);
    expect(mem.heapPct).toBeGreaterThanOrEqual(0);
    expect(mem.heapPct).toBeLessThanOrEqual(100);
  });

  it("parses pm2 jlist for grainscript", () => {
    const raw = JSON.stringify([
      {
        name: "other",
        pm2_env: { status: "online", restart_time: 1 },
        monit: { memory: 10 },
      },
      {
        name: "grainscript",
        pm2_env: { status: "online", restart_time: 3 },
        monit: { memory: 50 * 1024 * 1024 },
      },
    ]);
    expect(parsePm2App(raw, "grainscript")).toEqual({
      name: "grainscript",
      status: "online",
      restarts: 3,
      memoryMB: 50,
    });
    expect(parsePm2App("not-json", "grainscript")).toBeNull();
    expect(parsePm2App("[]", "grainscript")).toBeNull();
  });
});

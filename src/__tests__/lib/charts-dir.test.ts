import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureChartsDir, getChartsDir, resolveChartFile } from "@/lib/charts-dir";

const ORIGINAL_ROOT = process.env.GRAINSCRIPT_DATA_ROOT;

afterEach(() => {
  if (ORIGINAL_ROOT === undefined) delete process.env.GRAINSCRIPT_DATA_ROOT;
  else process.env.GRAINSCRIPT_DATA_ROOT = ORIGINAL_ROOT;
});

describe("charts-dir", () => {
  it("指向 data/charts 且可用 GRAINSCRIPT_DATA_ROOT 固定", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gs-charts-"));
    process.env.GRAINSCRIPT_DATA_ROOT = tmp;
    expect(getChartsDir()).toBe(path.join(tmp, "data", "charts"));
    expect(resolveChartFile("a.png")).toBe(path.join(tmp, "data", "charts", "a.png"));
    const dir = ensureChartsDir();
    expect(fs.existsSync(dir)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

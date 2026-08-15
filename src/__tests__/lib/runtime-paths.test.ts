import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRuntimeRootFromCwd } from "@/lib/runtime-paths";

const ORIGINAL_ROOT = process.env.GRAINSCRIPT_DATA_ROOT;

afterEach(() => {
  if (ORIGINAL_ROOT === undefined) delete process.env.GRAINSCRIPT_DATA_ROOT;
  else process.env.GRAINSCRIPT_DATA_ROOT = ORIGINAL_ROOT;
});

describe("resolveRuntimeRootFromCwd", () => {
  it("普通 cwd 原样返回", () => {
    delete process.env.GRAINSCRIPT_DATA_ROOT;
    expect(resolveRuntimeRootFromCwd("D:\\project\\论文助手")).toBe("D:\\project\\论文助手");
  });

  it("cwd 落在 .next/standalone 时回到仓库根", () => {
    delete process.env.GRAINSCRIPT_DATA_ROOT;
    expect(resolveRuntimeRootFromCwd("D:\\project\\论文助手\\.next\\standalone")).toBe(
      "D:\\project\\论文助手",
    );
    expect(resolveRuntimeRootFromCwd("/home/ubuntu/grainscript/.next/standalone")).toBe(
      "/home/ubuntu/grainscript",
    );
  });

  it("GRAINSCRIPT_DATA_ROOT 优先于 cwd", () => {
    process.env.GRAINSCRIPT_DATA_ROOT = path.resolve("/tmp/gs-data");
    expect(resolveRuntimeRootFromCwd("/home/ubuntu/grainscript/.next/standalone")).toBe(
      path.resolve("/tmp/gs-data"),
    );
  });
});

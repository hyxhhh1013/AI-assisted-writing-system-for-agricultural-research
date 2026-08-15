import fs from "fs";
import path from "path";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";

/** 生成图落盘目录：仓库根 `data/charts`，不跟 `.next/standalone` 走 */
export function getChartsDir(): string {
  return resolveProjectRuntimePath("data", "charts");
}

export function ensureChartsDir(): string {
  const dir = getChartsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveChartFile(filename: string): string {
  return path.join(getChartsDir(), filename);
}

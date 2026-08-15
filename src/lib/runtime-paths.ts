import path from "path";

/**
 * 运行时数据根目录。
 * - `GRAINSCRIPT_DATA_ROOT` 优先（本地/部署把 data 固定到仓库外也可）
 * - 若 cwd 落在 `.next/standalone`（本地 `node .next/standalone/server.js`），回退到仓库根
 *   避免 rebuild 清掉 `.next` 时把图表一并删掉
 */
export function resolveRuntimeRootFromCwd(cwd: string): string {
  const override = process.env.GRAINSCRIPT_DATA_ROOT?.trim();
  if (override) return path.resolve(override);
  const standalone = cwd.match(/^(.*?)[\\/]\.next[\\/]standalone(?:[\\/].*)?$/i);
  if (standalone?.[1]) return standalone[1];
  return cwd;
}

export function getProjectRuntimeRoot(): string {
  return resolveRuntimeRootFromCwd(/* turbopackIgnore: true */ process.cwd());
}

export function resolveProjectRuntimePath(...segments: string[]): string {
  return path.join(getProjectRuntimeRoot(), ...segments);
}

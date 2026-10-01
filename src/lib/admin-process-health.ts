import fs from "fs";
import { execFile } from "child_process";

export interface AdminProcessHealth {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapPct: number;
  chromiumAvailable: boolean;
  chromiumPath: string | null;
  pm2: {
    name: string;
    status: string;
    restarts: number;
    memoryMB: number;
  } | null;
}

export function collectNodeMemory(): Pick<
  AdminProcessHealth,
  "heapUsedMB" | "heapTotalMB" | "rssMB" | "heapPct"
> {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapPct = heapTotalMB > 0 ? Math.round((heapUsedMB / heapTotalMB) * 100) : 0;
  return { heapUsedMB, heapTotalMB, rssMB, heapPct };
}

export function detectChromium(): { available: boolean; path: string | null } {
  const envPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    || process.env.CHROMIUM_PATH
    || "";
  if (envPath.startsWith("/") || /^[A-Za-z]:\\/.test(envPath)) {
    if (fs.existsSync(envPath)) return { available: true, path: envPath };
  }
  try {
    // playwright 可能未装；探测失败不当成健康接口错误
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = require("playwright") as {
      chromium: { executablePath: () => string };
    };
    const execPath = chromium.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      return { available: true, path: execPath };
    }
    return { available: false, path: execPath || null };
  } catch {
    return { available: false, path: null };
  }
}

export function parsePm2App(
  raw: string,
  name: string,
): AdminProcessHealth["pm2"] {
  try {
    const list = JSON.parse(raw) as Array<{
      name?: string;
      pm2_env?: { status?: string; restart_time?: number };
      monit?: { memory?: number };
    }>;
    const app = list.find((item) => item.name === name);
    if (!app) return null;
    return {
      name,
      status: app.pm2_env?.status ?? "unknown",
      restarts: app.pm2_env?.restart_time ?? 0,
      memoryMB: Math.round((app.monit?.memory ?? 0) / 1024 / 1024),
    };
  } catch {
    return null;
  }
}

export function readPm2App(name = "grainscript"): Promise<AdminProcessHealth["pm2"]> {
  return new Promise((resolve) => {
    execFile("pm2", ["jlist"], { timeout: 2500, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      resolve(parsePm2App(stdout, name));
    });
  });
}

export async function collectProcessHealth(): Promise<AdminProcessHealth> {
  const mem = collectNodeMemory();
  const chromium = detectChromium();
  const pm2 = await readPm2App("grainscript");
  return {
    ...mem,
    chromiumAvailable: chromium.available,
    chromiumPath: chromium.path,
    pm2,
  };
}

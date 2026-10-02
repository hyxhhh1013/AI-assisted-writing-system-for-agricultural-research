import { execFile } from "child_process";
import v8 from "v8";
import { detectChromium } from "@/lib/chromium-path";

export interface AdminProcessHealth {
  heapUsedMB: number;
  heapTotalMB: number;
  heapLimitMB: number;
  rssMB: number;
  heapPct: number;
  chromiumAvailable: boolean;
  chromiumPath: string | null;
  pm2: {
    name: string;
    status: string;
    restarts: number;
    unstableRestarts: number;
    maxMemoryMB: number | null;
    memoryMB: number;
  } | null;
}

export function collectNodeMemory(): Pick<
  AdminProcessHealth,
  "heapUsedMB" | "heapTotalMB" | "heapLimitMB" | "rssMB" | "heapPct"
> {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapLimitMB = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
  const denom = heapLimitMB > 0 ? heapLimitMB : heapTotalMB;
  const heapPct = denom > 0 ? Math.round((heapUsedMB / denom) * 100) : 0;
  return { heapUsedMB, heapTotalMB, heapLimitMB, rssMB, heapPct };
}

function bytesToMb(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 1024 / 1024);
}

export function parsePm2App(
  raw: string,
  name: string,
): AdminProcessHealth["pm2"] {
  try {
    const list = JSON.parse(raw) as Array<{
      name?: string;
      pm2_env?: {
        status?: string;
        restart_time?: number;
        unstable_restarts?: number;
        max_memory_restart?: number;
      };
      monit?: { memory?: number };
    }>;
    const app = list.find((item) => item.name === name);
    if (!app) return null;
    return {
      name,
      status: app.pm2_env?.status ?? "unknown",
      restarts: app.pm2_env?.restart_time ?? 0,
      unstableRestarts: app.pm2_env?.unstable_restarts ?? 0,
      maxMemoryMB: bytesToMb(app.pm2_env?.max_memory_restart),
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

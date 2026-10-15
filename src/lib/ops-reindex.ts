import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { isShanghaiDeepNight } from "@/lib/ops-night-window";

const LOCK = () => path.join(process.cwd(), "data", "ops-reindex.lock");
const LOG = () => path.join(process.cwd(), "data", "ops-reindex.log");

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readReindexLock(): { pid: number; startedAt: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCK(), "utf8")) as { pid?: unknown; startedAt?: unknown };
    if (typeof raw.pid !== "number" || typeof raw.startedAt !== "string") return null;
    if (!pidAlive(raw.pid)) return null;
    return { pid: raw.pid, startedAt: raw.startedAt };
  } catch {
    return null;
  }
}

export interface OpsReindexStart {
  started: boolean;
  running: boolean;
  pid?: number;
  reason?: string;
}

/** 启动全库重切（--rechunk）。窗外或已有进程时不启动。 */
export function startOpsReindex(now = new Date()): OpsReindexStart {
  if (!isShanghaiDeepNight(now)) {
    return { started: false, running: false, reason: "重切只在北京时间 00:30–05:00 进行" };
  }
  const existing = readReindexLock();
  if (existing) {
    return { started: false, running: true, pid: existing.pid, reason: "已有重切在跑" };
  }

  const script = path.join(process.cwd(), "scripts", "index-pdfs.mjs");
  fs.mkdirSync(path.dirname(LOG()), { recursive: true });
  const logFd = fs.openSync(LOG(), "a");
  const child = spawn(process.execPath, [script, "--progress", "--rechunk"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(logFd);
  const startedAt = new Date().toISOString();
  fs.writeFileSync(LOCK(), JSON.stringify({ pid: child.pid, startedAt }));
  return { started: true, running: true, pid: child.pid ?? undefined };
}

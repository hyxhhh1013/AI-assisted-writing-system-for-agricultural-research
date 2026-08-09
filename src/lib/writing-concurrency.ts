/**
 * 进程内扩写管道并发信号量（ENG-PR-087）。
 * 单 PM2 实例 VPS 足够；多实例部署需另开分布式锁 PR。
 *
 * 2026-08-06：并发已满时不再硬报错，改为排队等待（waitForWritingSlot），
 * 超时后才抛友好提示，避免多人使用时「扩写并发已满」直接吓退用户。
 *
 * 2026-08-07：增加轻量排队观测（getWritingQueueStats）——排队次数 / 排队总毫秒 /
 * 超时次数，供 Admin 面板量化「提高并发上限」的收益（并发 3 上线后观察排队是否缓解）。
 * 纯内存环形累计，进程重启即清零；不做持久化，避免观测引入 DB 依赖。
 */

import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_MAX = 2;
/** 排队等待写槽的最长时长 */
const DEFAULT_QUEUE_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;
/** 排队观测计数的保护上限（防内存无限增长；达到后停止累计） */
const MAX_QUEUE_STATS_ROLLOVER = 1_000_000;

function parseMaxConcurrent(): number {
  const raw = process.env.WRITING_MAX_CONCURRENT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX;
  return n;
}

function parseQueueWaitMs(): number {
  const raw = process.env.WRITING_QUEUE_WAIT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_QUEUE_WAIT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_QUEUE_WAIT_MS;
  return n;
}

let activeCount = 0;
let maxConcurrent = parseMaxConcurrent();
let queueWaitMs = parseQueueWaitMs();
/** 进程启动后是否已从 SystemSetting 叠加过并发上限 */
let settingsHydrated = false;

async function hydrateMaxFromSettingsOnce(): Promise<void> {
  if (settingsHydrated) return;
  settingsHydrated = true;
  try {
    const { getSetting } = await import("@/lib/settings");
    const v = (await getSetting("WRITING_MAX_CONCURRENT"))?.trim();
    if (!v) return;
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1) {
      maxConcurrent = Math.min(32, Math.floor(n));
    }
  } catch {
    /* ignore */
  }
}

/** 排队观测：waitCount=排队次数（含超时），waitMs=实际排队总毫秒，timeoutCount=排队后超时次数 */
let queueWaitCount = 0;
let queueWaitMsTotal = 0;
let queueTimeoutCount = 0;

export function getWritingMaxConcurrent(): number {
  return maxConcurrent;
}

/** Admin 保存 WRITING_MAX_CONCURRENT 后立即生效（进程内） */
export function setWritingMaxConcurrent(next: number): void {
  if (!Number.isFinite(next) || next < 1) return;
  maxConcurrent = Math.min(32, Math.floor(next));
}

export function getActiveWritingCount(): number {
  return activeCount;
}

export function isWritingUnderLoad(): boolean {
  return activeCount >= maxConcurrent;
}

/** 排队观测快照（Admin 面板读取；进程内累计） */
export function getWritingQueueStats(): {
  waitCount: number;
  waitMs: number;
  timeoutCount: number;
  maxConcurrent: number;
} {
  return {
    waitCount: queueWaitCount,
    waitMs: queueWaitMsTotal,
    timeoutCount: queueTimeoutCount,
    maxConcurrent,
  };
}

/** 占用一个扩写槽位；已满时返回 false */
export function tryAcquireWritingSlot(): boolean {
  if (activeCount >= maxConcurrent) return false;
  activeCount += 1;
  return true;
}

export function releaseWritingSlot(): void {
  if (activeCount > 0) activeCount -= 1;
}

/**
 * 排队等待写槽：并发已满时轮询等待，成功占用返回 true。
 * 超过 WRITING_QUEUE_WAIT_MS 或 signal 中断返回 false（调用方给友好提示）。
 * 进入过排队（首次获取失败）就计入观测；直接取得槽位不计数。
 */
export async function waitForWritingSlot(
  signal?: AbortSignal,
): Promise<boolean> {
  await hydrateMaxFromSettingsOnce();
  if (tryAcquireWritingSlot()) return true;
  const startedAt = Date.now();
  queueWaitCount += 1;
  const deadline = startedAt + queueWaitMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    if (tryAcquireWritingSlot()) {
      if (queueWaitCount <= MAX_QUEUE_STATS_ROLLOVER) {
        queueWaitMsTotal += Date.now() - startedAt;
      }
      return true;
    }
  }
  if (queueWaitCount <= MAX_QUEUE_STATS_ROLLOVER) {
    queueTimeoutCount += 1;
  }
  return false;
}

/** 并发满时的友好提示（写队列场景） */
export function buildWritingBusyMessage(): string {
  return (
    `当前同时进行的写作任务已达上限（${maxConcurrent} 个），已排队等待，稍后会自动开始。`
    + "若等待较久仍未开始，请稍候 1-2 分钟再试。"
  );
}

/** 仅 vitest 使用 */
export function resetWritingConcurrencyForTests(
  nextMax?: number,
  nextQueueWaitMs?: number,
): void {
  activeCount = 0;
  queueWaitCount = 0;
  queueWaitMsTotal = 0;
  queueTimeoutCount = 0;
  settingsHydrated = true; // 测试跳过 DB hydrate，避免污染 mock
  if (nextMax !== undefined) {
    maxConcurrent = nextMax;
  } else {
    maxConcurrent = parseMaxConcurrent();
  }
  if (nextQueueWaitMs !== undefined) {
    queueWaitMs = nextQueueWaitMs;
  } else {
    queueWaitMs = parseQueueWaitMs();
  }
}

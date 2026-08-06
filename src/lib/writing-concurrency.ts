/**
 * 进程内扩写管道并发信号量（ENG-PR-087）。
 * 单 PM2 实例 VPS 足够；多实例部署需另开分布式锁 PR。
 *
 * 2026-08-06：并发已满时不再硬报错，改为排队等待（waitForWritingSlot），
 * 超时后才抛友好提示，避免多人使用时「扩写并发已满」直接吓退用户。
 */

import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_MAX = 2;
/** 排队等待写槽的最长时长 */
const DEFAULT_QUEUE_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;

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

export function getWritingMaxConcurrent(): number {
  return maxConcurrent;
}

export function getActiveWritingCount(): number {
  return activeCount;
}

export function isWritingUnderLoad(): boolean {
  return activeCount >= maxConcurrent;
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
 */
export async function waitForWritingSlot(
  signal?: AbortSignal,
): Promise<boolean> {
  if (tryAcquireWritingSlot()) return true;
  const deadline = Date.now() + queueWaitMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    if (tryAcquireWritingSlot()) return true;
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

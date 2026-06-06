/**
 * 进程内扩写管道并发信号量（ENG-PR-087）。
 * 单 PM2 实例 VPS 足够；多实例部署需另开分布式锁 PR。
 */

const DEFAULT_MAX = 2;

function parseMaxConcurrent(): number {
  const raw = process.env.WRITING_MAX_CONCURRENT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX;
  return n;
}

let activeCount = 0;
let maxConcurrent = parseMaxConcurrent();

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

/** 仅 vitest 使用 */
export function resetWritingConcurrencyForTests(nextMax?: number): void {
  activeCount = 0;
  if (nextMax !== undefined) {
    maxConcurrent = nextMax;
  } else {
    maxConcurrent = parseMaxConcurrent();
  }
}

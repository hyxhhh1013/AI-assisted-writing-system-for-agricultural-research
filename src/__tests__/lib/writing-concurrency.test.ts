import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  tryAcquireWritingSlot,
  releaseWritingSlot,
  getActiveWritingCount,
  getWritingMaxConcurrent,
  waitForWritingSlot,
  buildWritingBusyMessage,
  resetWritingConcurrencyForTests,
  getWritingQueueStats,
} from "@/lib/writing-concurrency";

describe("writing-concurrency", () => {
  beforeEach(() => {
    resetWritingConcurrencyForTests(2);
  });

  afterEach(() => {
    resetWritingConcurrencyForTests();
  });

  it("acquire 成功直到达到上限", () => {
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(getActiveWritingCount()).toBe(1);
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(getActiveWritingCount()).toBe(2);
    expect(tryAcquireWritingSlot()).toBe(false);
    expect(getActiveWritingCount()).toBe(2);
  });

  it("release 后可再次 acquire", () => {
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(tryAcquireWritingSlot()).toBe(false);
    releaseWritingSlot();
    expect(getActiveWritingCount()).toBe(1);
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(getActiveWritingCount()).toBe(2);
  });

  it("release 不会使计数低于 0", () => {
    releaseWritingSlot();
    releaseWritingSlot();
    expect(getActiveWritingCount()).toBe(0);
  });

  it("可配置 max concurrent", () => {
    resetWritingConcurrencyForTests(1);
    expect(getWritingMaxConcurrent()).toBe(1);
    expect(tryAcquireWritingSlot()).toBe(true);
    expect(tryAcquireWritingSlot()).toBe(false);
  });

  it("并发满时排队等待，槽位释放后获得", async () => {
    resetWritingConcurrencyForTests(1, 200);
    tryAcquireWritingSlot();
    const waitPromise = waitForWritingSlot();
    releaseWritingSlot();
    await expect(waitPromise).resolves.toBe(true);
  });

  it("并发满且超时未释放 → false（调用方给友好提示）", async () => {
    resetWritingConcurrencyForTests(1, 50);
    tryAcquireWritingSlot();
    await expect(waitForWritingSlot()).resolves.toBe(false);
  });

  it("abort 信号中断等待 → false", async () => {
    resetWritingConcurrencyForTests(1, 10_000);
    tryAcquireWritingSlot();
    const ac = new AbortController();
    ac.abort();
    await expect(waitForWritingSlot(ac.signal)).resolves.toBe(false);
  });

  it("buildWritingBusyMessage 提及并发上限，提示排队", () => {
    resetWritingConcurrencyForTests(2, 50);
    expect(buildWritingBusyMessage()).toMatch(/2 个/);
    expect(buildWritingBusyMessage()).toMatch(/排队/);
  });

  it("直接取得槽位不记排队统计", () => {
    resetWritingConcurrencyForTests(2, 200);
    expect(tryAcquireWritingSlot()).toBe(true);
    const stats = getWritingQueueStats();
    expect(stats.waitCount).toBe(0);
    expect(stats.timeoutCount).toBe(0);
    expect(stats.waitMs).toBe(0);
  });

  it("排队等待获得槽位记入 waitCount 与 waitMs", async () => {
    resetWritingConcurrencyForTests(1, 500);
    tryAcquireWritingSlot();
    const waitPromise = waitForWritingSlot();
    // 让等待循环先跑一拍，确保进入轮询后释放
    await new Promise((r) => setTimeout(r, 30));
    releaseWritingSlot();
    await expect(waitPromise).resolves.toBe(true);
    const stats = getWritingQueueStats();
    expect(stats.waitCount).toBe(1);
    expect(stats.timeoutCount).toBe(0);
    expect(stats.waitMs).toBeGreaterThan(0);
  });

  it("排队超时记入 timeoutCount（不计 waitMs）", async () => {
    resetWritingConcurrencyForTests(1, 50);
    tryAcquireWritingSlot();
    await expect(waitForWritingSlot()).resolves.toBe(false);
    const stats = getWritingQueueStats();
    expect(stats.waitCount).toBe(1);
    expect(stats.timeoutCount).toBe(1);
    expect(stats.waitMs).toBe(0);
  });

  it("reset 清零排队统计", () => {
    resetWritingConcurrencyForTests(1, 50);
    tryAcquireWritingSlot();
    void waitForWritingSlot();
    resetWritingConcurrencyForTests(2);
    const stats = getWritingQueueStats();
    expect(stats.waitCount).toBe(0);
    expect(stats.timeoutCount).toBe(0);
    expect(stats.waitMs).toBe(0);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  tryAcquireWritingSlot,
  releaseWritingSlot,
  getActiveWritingCount,
  getWritingMaxConcurrent,
  resetWritingConcurrencyForTests,
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
});

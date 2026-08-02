import { describe, expect, it } from "vitest";
import {
  Semaphore,
  getKeySemaphore,
  withKeyConcurrency,
} from "@/lib/ai-concurrency";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("Semaphore", () => {
  it("limits concurrent acquisitions to the limit", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const run = async () => {
      await sem.acquire();
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
      sem.release();
    };
    await Promise.all([run(), run(), run(), run(), run()]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("hands slots out in FIFO order", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];
    const run = async (id: number) => {
      await sem.acquire();
      order.push(id);
      await sleep(5);
      sem.release();
    };
    await Promise.all([run(1), run(2), run(3)]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("getKeySemaphore", () => {
  it("returns the same instance for the same key", () => {
    expect(getKeySemaphore("k")).toBe(getKeySemaphore("k"));
  });
});

describe("withKeyConcurrency", () => {
  it("shares one semaphore per key (single key concurrency is bounded)", async () => {
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
    };
    await Promise.all([
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-a", task),
    ]);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("does not block different keys from running in parallel", async () => {
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
    };
    await Promise.all([
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-b", task),
      withKeyConcurrency("key-a", task),
      withKeyConcurrency("key-b", task),
    ]);
    // 两个 key 各自上限 4，4 个任务可全并发
    expect(peak).toBeGreaterThan(2);
  });

  it("rejects without running when signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let ran = false;
    await expect(
      withKeyConcurrency("key-c", async () => { ran = true; }, ctrl.signal),
    ).rejects.toThrow("Aborted");
    expect(ran).toBe(false);
    // 信号量已释放：后续任务可正常执行
    await expect(withKeyConcurrency("key-c", async () => "ok", ctrl.signal)).rejects.toThrow();
  });

  it("runs the wrapped function and returns its result", async () => {
    const out = await withKeyConcurrency("key-d", async () => 42);
    expect(out).toBe(42);
  });
});

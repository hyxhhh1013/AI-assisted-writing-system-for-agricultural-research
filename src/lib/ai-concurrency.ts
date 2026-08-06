/**
 * per-API-Key 并发控制。
 *
 * 现状：单 key 多用户并发时所有请求直接并行打到上游，key 一撞限流就 429。
 * 这里用一个按 key 分桶的信号量，把每个 key 的 in-flight 请求限制在并发上限内，
 * 超出的请求排队等待，避免单 key 把上游打爆。
 *
 * 多 key 场景：每个 key 独立计数（轮转后各 key 各自限流），互不阻塞。
 * 空闲的信号量会从注册表移除，避免每个用过的 key 常驻内存。
 */

/** 每个 API Key 同时允许的最大 in-flight 请求数 */
export const PER_KEY_CONCURRENCY = 4;

/** 经典计数信号量：acquire 占用、release 释放，超出的排队（FIFO） */
export class Semaphore {
  private count: number;
  private waiters: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
    this.count = this.limit;
  }

  /**
   * 占用一个槽位。排队期间若 signal 中止：立即从队列移除并 reject，
   * 不占用槽位也不阻塞后续请求。
   */
  acquire(signal?: AbortSignal): Promise<void> {
    if (this.count > 0) {
      if (signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      this.count--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const onAbort = () => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const waiter = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      };
      this.waiters.push(waiter);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.count++;
  }

  /** 当前等待中的请求数（调试/监控用） */
  get pending(): number {
    return this.waiters.length;
  }

  /** 完全空闲：无等待者且无占用（供注册表清理判断） */
  get idle(): boolean {
    return this.waiters.length === 0 && this.count === this.limit;
  }
}

const semaphores = new Map<string, Semaphore>();

/** 按 key 获取（惰性创建）信号量 */
export function getKeySemaphore(key: string, limit = PER_KEY_CONCURRENCY): Semaphore {
  let sem = semaphores.get(key);
  if (!sem) {
    sem = new Semaphore(limit);
    semaphores.set(key, sem);
  }
  return sem;
}

/** 信号量完全空闲时从注册表移除，防止 key 常驻内存。同步调用，单线程下无竞态。 */
function maybeDropSemaphore(key: string, sem: Semaphore): void {
  if (sem.idle && semaphores.get(key) === sem) {
    semaphores.delete(key);
  }
}

/**
 * 以指定 key 的并发上限执行 fn；排队期间外部 signal 中止会立即跳过本次执行。
 * 只覆盖到 fn resolve 为止（对 callAI 即"响应头已返回"），流式正文由调用方继续读，
 * 不影响已建立的 SSE 连接。
 */
export async function withKeyConcurrency<T>(
  key: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
  limit = PER_KEY_CONCURRENCY,
): Promise<T> {
  const sem = getKeySemaphore(key, limit);
  // acquire 已处理 abort（立即拒绝 / 排队中即时移除）
  await sem.acquire(signal);
  try {
    return await fn();
  } finally {
    sem.release();
    maybeDropSemaphore(key, sem);
  }
}

/**
 * per-API-Key 并发控制。
 *
 * 现状：单 key 多用户并发时所有请求直接并行打到上游，key 一撞限流就 429。
 * 这里用一个按 key 分桶的信号量，把每个 key 的 in-flight 请求限制在并发上限内，
 * 超出的请求排队等待，避免单 key 把上游打爆。
 *
 * 多 key 场景：每个 key 独立计数（轮转后各 key 各自限流），互不阻塞。
 */

/** 每个 API Key 同时允许的最大 in-flight 请求数 */
export const PER_KEY_CONCURRENCY = 4;

/** 经典计数信号量：acquire 占用、release 释放，超出的排队（FIFO） */
export class Semaphore {
  private count: number;
  private waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.count = Math.max(1, limit);
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
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

/**
 * 以指定 key 的并发上限执行 fn；排队期间外部 signal 中止会跳过本次执行并释放信号量。
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
  await sem.acquire();
  // 排队结束若已被外部取消：让出信号量，不执行 fn
  if (signal?.aborted) {
    sem.release();
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    return await fn();
  } finally {
    sem.release();
  }
}

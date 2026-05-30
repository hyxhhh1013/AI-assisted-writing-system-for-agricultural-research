/** 带全周期超时的 fetch 封装。
 * - totalTimeoutMs：从连接建立开始的总超时
 * - 外部 signal 与内部超时 signal 合并，任意一个触发都会 abort
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal | null },
  retries = 2,
  totalTimeoutMs = 30000,
): Promise<Response> {
  const externalSignal = options.signal ?? null;
  const { signal: _sig, ...fetchOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), totalTimeoutMs);

    // 合并内部超时信号和外部信号
    let mergedSignal: AbortSignal;
    if (externalSignal) {
      const mergedController = new AbortController();
      const onAbort = () => {
        mergedController.abort();
        clearTimeout(timer);
      };
      timeoutController.signal.addEventListener("abort", onAbort, { once: true });
      externalSignal.addEventListener("abort", onAbort, { once: true });
      if (timeoutController.signal.aborted || externalSignal.aborted) {
        mergedController.abort();
      }
      mergedSignal = mergedController.signal;
    } else {
      mergedSignal = timeoutController.signal;
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: mergedSignal,
      });

      // 包装 json() / text() 接入超时
      const origJson = response.json.bind(response);
      const origText = response.text.bind(response);
      response.json = () => raceWithAbort(origJson(), mergedSignal, timer) as Promise<any>;
      response.text = () => raceWithAbort(origText(), mergedSignal, timer) as Promise<string>;

      return response;
    } catch (error: any) {
      clearTimeout(timer);
      // 清理事件监听
      if (externalSignal && mergedSignal !== timeoutController.signal) {
        // mergedController 是局部变量，GC 会处理
      }
      if (error?.name === "AbortError") {
        if (attempt === retries) {
          const reason = externalSignal?.aborted ? "请求已被取消" : `请求超时 (${totalTimeoutMs / 1000}s)`;
          throw new Error(reason);
        }
      } else if (attempt === retries) {
        throw error;
      }
      // 不重试 4xx 客户端错误（模型名错误、参数非法等不会自己恢复）
      if (error?.status && error.status >= 400 && error.status < 500) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Request failed after retries");
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal, timer: ReturnType<typeof setTimeout>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

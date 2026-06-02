/**
 * Next.js instrumentation — 全局错误兜底
 * 防止 AbortError (客户端断开) 等非致命错误杀死进程
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason: unknown) => {
      // AbortError: 客户端断开连接，正常行为，不应崩溃
      if (reason instanceof DOMException && reason.name === "AbortError") {
        return; // 静默忽略
      }
      // 其他未捕获异常：记录但不崩溃
      console.error("[unhandledRejection]", reason instanceof Error ? reason.message : String(reason));
    });

    process.on("uncaughtException", (error: Error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("[uncaughtException]", error.message, error.stack?.slice(0, 500));
    });
  }
}

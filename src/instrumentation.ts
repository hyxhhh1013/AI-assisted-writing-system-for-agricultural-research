/**
 * Next.js instrumentation — 全局错误兜底 + RAG 预热
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 防止 AbortError 杀死进程
    process.on("unhandledRejection", (reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      console.error("[unhandledRejection]", reason instanceof Error ? reason.message : String(reason));
    });

    process.on("uncaughtException", (error: Error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("[uncaughtException]", error.message, error.stack?.slice(0, 500));
    });

    // RAG 预热：启动时加载索引和嵌入，避免首次请求等 30+s
    setTimeout(async () => {
      try {
        const { localRAG } = await import("@/lib/rag");
        console.log("[warmup] RAG 预热开始...");
        await localRAG.getCategories();
        await (localRAG as any).ensureAllLoaded?.();
        console.log("[warmup] RAG 预热完成");
      } catch (e) {
        console.warn("[warmup] RAG 预热失败（非致命）:", (e as Error).message);
      }
    }, 3000); // 等 3 秒让服务器先 ready
  }
}

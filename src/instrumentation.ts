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

    // RAG 预热：后台预加载全库 chunks + 倒排索引，把冷启动开销移出用户首次检索。
    // P0 后全库向量不再灌入 JS 内存（仅保留紧凑 .emb Buffer），预加载内存峰值可控。
    // 设 RAG_WARMUP=0 可关闭（内存极紧张时回退按需加载）。
    if (process.env.RAG_WARMUP !== "0") {
      setTimeout(async () => {
        try {
          const { localRAG } = await import("@/lib/rag");
          console.log("[warmup] RAG 全库预热开始...");
          const { chunks, ms } = await localRAG.warmup();
          console.log(`[warmup] RAG 预热完成：${chunks} chunks，耗时 ${ms}ms`);
        } catch (e) {
          console.warn("[warmup] RAG 预热失败（非致命）:", (e as Error).message);
        }
      }, 3000);
    }
  }
}

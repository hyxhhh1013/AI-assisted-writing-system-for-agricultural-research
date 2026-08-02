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

    // 加载 Admin 配置的角色→provider 映射（同步读内存缓存，不阻塞启动）
    setTimeout(() => {
      import("@/lib/models").then(({ loadAgentRoleProviders }) => {
        loadAgentRoleProviders().then(() => {
          console.log("[models] 角色→provider 映射已加载");
        }).catch((e) => console.warn("[models] 角色映射加载失败（非致命）:", (e as Error).message));
      }).catch(() => {});
    }, 0);

    // RAG 预热：默认 light（仅元数据）；full=全库；RAG_WARMUP=0 关闭
    if (ragWarmupMode() !== "off") {
      setTimeout(async () => {
        try {
          const { localRAG } = await import("@/lib/rag");
          console.log("[warmup] RAG 预热开始...");
          const { chunks, ms, mode } = await localRAG.warmup();
          console.log(`[warmup] RAG 预热完成：mode=${mode} chunks=${chunks}，耗时 ${ms}ms`);
        } catch (e) {
          console.warn("[warmup] RAG 预热失败（非致命）:", (e as Error).message);
        }
      }, 3000);
    }
  }
}

function ragWarmupMode(): "light" | "full" | "off" {
  const raw = (process.env.RAG_WARMUP ?? "light").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false" || raw === "no") return "off";
  if (raw === "full" || raw === "1" || raw === "true" || raw === "yes") return "full";
  return "light";
}

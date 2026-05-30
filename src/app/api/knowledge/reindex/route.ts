import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import type { ReindexProgressEvent } from "@/contracts/reindex";

const PROGRESS_PREFIX = "__INDEX_PROGRESS__";

export async function POST(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const emit = (event: ReindexProgressEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const finish = (errorMessage?: string) => {
        if (closed) return;
        closed = true;
        if (errorMessage) {
          emit({ type: "error", message: errorMessage });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      const scriptPath = path.join(process.cwd(), "scripts", "index-pdfs.mjs");
      const child = spawn(process.execPath, [scriptPath, "--progress"], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdoutBuffer = "";

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith(PROGRESS_PREFIX)) return;
        try {
          const payload = JSON.parse(trimmed.slice(PROGRESS_PREFIX.length)) as ReindexProgressEvent;
          emit(payload);
        } catch (err) {
          logger.warn("Failed to parse index progress line:", err);
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) handleLine(line);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        logger.warn("index-pdfs stderr:", chunk.toString());
      });

      child.on("error", (err) => {
        logger.error("index-pdfs spawn error:", err);
        finish(err.message || "无法启动索引进程");
      });

      child.on("close", (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);

        if (code === 0) {
          try {
            localRAG.reload();
            invalidateBibCache();
          } catch (err) {
            logger.error("RAG reload after reindex failed:", err);
          }
          finish();
          return;
        }

        finish(`索引进程异常退出（code ${code ?? "unknown"}）`);
      });

      const onAbort = () => {
        if (!child.killed) child.kill("SIGTERM");
        finish("索引任务已取消");
      };

      if (req.signal.aborted) {
        onAbort();
        return;
      }
      req.signal.addEventListener("abort", onAbort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

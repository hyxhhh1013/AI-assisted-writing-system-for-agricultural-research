import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import type { ReindexProgressEvent, ReindexRequest } from "@/contracts/reindex";

const PROGRESS_PREFIX = "__INDEX_PROGRESS__";

function buildScriptArgs(options: ReindexRequest): string[] {
  const args = ["--progress"];
  if (options.forceStage1) args.push("--force-stage1");
  if (options.forceStage3) args.push("--force-stage3");
  if (options.files && options.files.length > 0) {
    args.push(`--files=${options.files.map((name) => encodeURIComponent(name)).join(",")}`);
  }
  return args;
}

function parseReindexBody(body: unknown): ReindexRequest {
  if (body == null || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const files = Array.isArray(record.files)
    ? record.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  return {
    files: files && files.length > 0 ? files : undefined,
    forceStage1: record.forceStage1 === true,
    forceStage3: record.forceStage3 === true,
  };
}

export async function POST(req: NextRequest) {
  let options: ReindexRequest = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      options = parseReindexBody(JSON.parse(text) as unknown);
    }
  } catch {
    return Response.json({ error: "无效的 reindex 请求体" }, { status: 400 });
  }

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
      const scriptArgs = buildScriptArgs(options);
      const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
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

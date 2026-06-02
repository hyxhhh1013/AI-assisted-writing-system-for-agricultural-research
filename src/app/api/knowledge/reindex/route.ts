import { createLogger } from "@/lib/logger";

const log = createLogger("api/knowledge/reindex");
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import type { ReindexProgressEvent } from "@/contracts/reindex";
import { validateBody } from "@/lib/api-validate";
import { reindexRequestSchema, type ReindexRequestInput } from "@/lib/validations";

const PROGRESS_PREFIX = "__INDEX_PROGRESS__";

function buildScriptArgs(options: ReindexRequestInput): string[] {
  const args = ["--progress"];
  if (options.forceStage1) args.push("--force-stage1");
  if (options.forceStage3) args.push("--force-stage3");
  if (options.files && options.files.length > 0) {
    args.push(`--files=${options.files.map((name) => encodeURIComponent(name)).join(",")}`);
  }
  return args;
}

export async function POST(req: NextRequest) {
  let options: ReindexRequestInput = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      const { data, errorResponse: ve } = await validateBody(
        reindexRequestSchema,
        JSON.parse(text) as unknown,
      );
      if (ve) return ve;
      options = data;
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
          log.warn("failed to parse index progress line", err);
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) handleLine(line);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        log.warn("index-pdfs stderr", { stderr: chunk.toString().slice(0, 500) });
      });

      child.on("error", (err) => {
        log.fail("index-pdfs spawn error", err);
        finish(err.message || "无法启动索引进程");
      });

      child.on("close", (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);

        if (code === 0) {
          (async () => {
            try {
              await localRAG.reload();
              invalidateBibCache();
            } catch (err) {
              log.fail("RAG reload after reindex failed", err);
            }
          })();
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

import { createLogger } from "@/lib/logger";

const log = createLogger("api/knowledge/reindex");
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import type { ReindexProgressEvent } from "@/contracts/reindex";
import { validateBody } from "@/lib/api-validate";
import { reindexRequestSchema, type ReindexRequestInput } from "@/lib/validations";

const PROGRESS_PREFIX = "__INDEX_PROGRESS__";
const PROGRESS_FILE = path.join(process.cwd(), "data", "_reindex_progress.jsonl");

/** 当前正在运行的 reindex 子进程（后台运行，不受 SSE 连接影响） */
let activeChild: ReturnType<typeof spawn> | null = null;
/** 当前任务的 event 计数，用于客户端断线重连时跳过已收到的事件 */
let activeTaskEventCount = 0;
/** 当前任务是否已完成 */
let activeTaskComplete = false;

function buildScriptArgs(options: ReindexRequestInput): string[] {
  const args = ["--progress"];
  if (options.forceStage1) args.push("--force-stage1");
  if (options.forceStage3) args.push("--force-stage3");
  if (options.rechunk) args.push("--rechunk");
  if (options.files && options.files.length > 0) {
    args.push(`--files=${options.files.map((name) => encodeURIComponent(name)).join(",")}`);
  }
  return args;
}

/** 清空旧的进度文件 */
function resetProgressFile() {
  try { fs.writeFileSync(PROGRESS_FILE, ""); } catch {}
}

/** 追加一个事件到进度文件 */
function appendProgressEvent(event: ReindexProgressEvent) {
  try {
    fs.appendFileSync(PROGRESS_FILE, JSON.stringify(event) + "\n");
    activeTaskEventCount++;
  } catch {}
}

/** 从进度文件读取指定 offset 之后的事件 */
function readProgressFromFile(sinceEventIndex: number): ReindexProgressEvent[] {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return [];
    const content = fs.readFileSync(PROGRESS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (sinceEventIndex >= lines.length) return [];
    return lines.slice(sinceEventIndex).map((line) => {
      try { return JSON.parse(line) as ReindexProgressEvent; } catch { return null; }
    }).filter(Boolean) as ReindexProgressEvent[];
  } catch {
    return [];
  }
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

  // 客户端上次收到的 event 索引（断线重连时传递）
  const cursorHeader = req.headers.get("x-reindex-cursor");
  const cursor = cursorHeader ? parseInt(cursorHeader, 10) : 0;

  // ── 情况 1: 已有 reindex 在后台运行 ──
  if (activeChild && !activeChild.killed) {
    log.info("检测到已有 reindex 在运行，复用现有进程");
    return streamExistingTask(cursor);
  }

  // ── 情况 2: 之前的 reindex 已完成但客户端还没收到 complete ──
  if (activeTaskComplete) {
    const events = readProgressFromFile(cursor);
    return streamReplayOnly(events, activeTaskComplete);
  }

  // ── 情况 3: 启动新的 reindex ──
  resetProgressFile();
  activeTaskEventCount = 0;
  activeTaskComplete = false;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const emit = (event: ReindexProgressEvent) => {
        appendProgressEvent(event);
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const finish = (errorMessage?: string) => {
        if (closed) return;
        closed = true;
        activeTaskComplete = true;
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

      // 存储活跃子进程，用于重连时复用
      activeChild = child;
      child.on("close", () => {
        activeChild = null;
      });

      const onAbort = () => {
        // 连接断开时不杀子进程，让它继续在后台运行
        if (!child.killed) {
          log.info("SSE 连接已断开，索引子进程继续在后台运行");
          child.stdout.removeAllListeners("data");
          child.stderr.removeAllListeners("data");
          child.removeAllListeners("close");
          child.removeAllListeners("error");
        }
        if (!closed) {
          closed = true;
          controller.close();
        }
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

/** 流式返回已有任务的进度（先回放历史事件，再实时转发） */
function streamExistingTask(cursor: number): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const enqueue = (data: string) => {
        if (!closed) controller.enqueue(encoder.encode(data));
      };

      // 1. 先回放 cursor 之后的历史事件
      const historical = readProgressFromFile(cursor);
      for (const event of historical) {
        enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }

      if (!activeChild || activeChild.killed) {
        // 进程已结束
        if (activeTaskComplete) {
          enqueue("data: [DONE]\n\n");
        } else {
          enqueue(`data: ${JSON.stringify({ type: "error", message: "索引进程已退出" })}\n\n`);
          enqueue("data: [DONE]\n\n");
        }
        controller.close();
        return;
      }

      // 2. 继续转发实时事件
      let stdoutBuffer = "";

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith(PROGRESS_PREFIX)) return;
        try {
          const payload = JSON.parse(trimmed.slice(PROGRESS_PREFIX.length)) as ReindexProgressEvent;
          appendProgressEvent(payload);
          enqueue(`data: ${JSON.stringify(payload)}\n\n`);
        } catch {}
      };

      const onStdout = (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) handleLine(line);
      };

      const onStderr = (chunk: Buffer) => {
        log.warn("index-pdfs stderr (reconnect)", { stderr: chunk.toString().slice(0, 200) });
      };

      const onClose = (code: number | null) => {
        if (closed) return;
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        if (code === 0) {
          enqueue("data: [DONE]\n\n");
        } else {
          enqueue(`data: ${JSON.stringify({ type: "error", message: `索引进程异常退出（code ${code ?? "unknown"}）` })}\n\n`);
          enqueue("data: [DONE]\n\n");
        }
        closed = true;
        controller.close();
      };

      const onError = (err: Error) => {
        if (closed) return;
        enqueue(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        enqueue("data: [DONE]\n\n");
        closed = true;
        controller.close();
      };

      activeChild.stdout!.on("data", onStdout);
      activeChild.stderr!.on("data", onStderr);
      activeChild.on("close", onClose);
      activeChild.on("error", onError);
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

/** 仅回放历史事件（任务已完成的情况） */
function streamReplayOnly(events: ReindexProgressEvent[], isComplete: boolean): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      if (isComplete) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }
      controller.close();
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

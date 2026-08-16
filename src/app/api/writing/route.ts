/**
 * 【已冻结 — W3-AP-ARCH-03】
 *
 * 本路由是「专家工具协作扩写」遗留管道（Writer → Verifier → Refiner）。
 * 产品写作入口是 Agent（`POST /api/agent`，工具挂载 `lib/agent/tools/registry.ts`）。
 *
 * 纪律：**新的写作规则/引用规则/质检只改 Agent 这条路径**，禁止再给本管道加功能。
 * 仅保留 bug 修复与安全加固；规则变更请改 Agent 侧，勿在此处新增分支。
 */
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { releaseWritingSlot, tryAcquireWritingSlot } from "@/lib/writing-concurrency";

const log = createLogger("api/writing");
import { NextRequest } from "next/server";
import type { WritingSSEEvent } from "@/contracts/sse";
import type { EvidenceClaim } from "@/contracts/data-source";
import { getAgentModelConfig } from "@/lib/ai";
import { validateBody } from "@/lib/api-validate";
import { writingSchema } from "@/lib/validations";
import { resolveWritingDraftContext } from "@/contracts/writing";
import { runWritingPipeline } from "./run-pipeline";
import type { WritingGlobalContext } from "./types";

export const runtime = "nodejs";
/** 写作全管道（检索 + 写作 + 核查 + 修正）可超过 5 分钟 */
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id") || undefined;
    const { data, errorResponse: ve } = await validateBody(writingSchema, await req.json());
    if (ve) return ve;

    const { context, bullets, globalContext: rawGlobalContext, dataClaims: rawDataClaims } = data;
    const dataClaims = (rawDataClaims ?? []) as EvidenceClaim[];
    const globalContext = rawGlobalContext as WritingGlobalContext | undefined;

    const draftContext = resolveWritingDraftContext(context, bullets);
    if (!draftContext) {
      return new Response(JSON.stringify({ error: "请填写扩写要点或补充说明" }), {
        status: 400,
      });
    }

    for (const role of ["writer", "verifier", "refiner"] as const) {
      const { keyError } = getAgentModelConfig(role);
      if (keyError && role === "writer") {
        return new Response(JSON.stringify({ error: keyError }), { status: 500 });
      }
    }

    if (!tryAcquireWritingSlot()) {
      return new Response(
        JSON.stringify({
          error: "系统繁忙，请稍后再试",
          code: "WRITING_CONCURRENCY_LIMIT",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
        let slotReleased = false;
        const releaseSlotOnce = () => {
          if (slotReleased) return;
          slotReleased = true;
          releaseWritingSlot();
        };

        const emit = (event: WritingSSEEvent) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            streamClosed = true;
          }
        };
        const finishStream = () => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            streamClosed = true;
          } catch {
            streamClosed = true;
          } finally {
            releaseSlotOnce();
          }
        };

        req.signal.addEventListener("abort", releaseSlotOnce, { once: true });

        try {
          await runWritingPipeline({
            req,
            data,
            context: draftContext,
            dataClaims,
            globalContext,
            userId,
            emit,
            finishStream,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? getErrorMessage(error) : "Internal Server Error";
          log.fail("pipeline error", error);
          try {
            emit({ type: "error", error: message });
          } catch {
            /* stream already closed */
          }
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        } finally {
          releaseSlotOnce();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "Internal Server Error";
    log.fail("request failed", error);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

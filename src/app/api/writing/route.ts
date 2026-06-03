import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

const log = createLogger("api/writing");
import { NextRequest } from "next/server";
import type { WritingSSEEvent } from "@/contracts/sse";
import type { EvidenceClaim } from "@/contracts/data-source";
import { getAgentModelConfig } from "@/lib/ai";
import { validateBody } from "@/lib/api-validate";
import { writingSchema } from "@/lib/validations";
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

    const { context, globalContext: rawGlobalContext, dataClaims: rawDataClaims } = data;
    const dataClaims = (rawDataClaims ?? []) as EvidenceClaim[];
    const globalContext = rawGlobalContext as WritingGlobalContext | undefined;

    if (!context) {
      return new Response(JSON.stringify({ error: "Missing required field: context" }), {
        status: 400,
      });
    }

    for (const role of ["writer", "verifier", "refiner"] as const) {
      const { keyError } = getAgentModelConfig(role);
      if (keyError && role === "writer") {
        return new Response(JSON.stringify({ error: keyError }), { status: 500 });
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
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
          }
        };
        try {
          await runWritingPipeline({
            req,
            data,
            context,
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

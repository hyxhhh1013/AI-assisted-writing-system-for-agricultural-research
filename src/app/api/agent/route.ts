import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { validateBody } from "@/lib/api-validate";
import { agentSchema } from "@/lib/validations";
import {
  createAgentContext,
  createAgentTools,
  isAgentEnabled,
  runAgentLoop,
} from "@/lib/agent";
import type { AgentSSEEvent } from "@/contracts/agent";

const log = createLogger("api/agent");

export const runtime = "nodejs";
export const maxDuration = 600;

function sseEncode(event: AgentSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  if (!isAgentEnabled()) {
    return new Response(
      JSON.stringify({ error: "Agent 功能未启用，请设置 AGENT_ENABLED=1" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, errorResponse } = await validateBody(agentSchema, await req.json());
    if (errorResponse) return errorResponse;

    const tools = createAgentTools();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const context = createAgentContext({
          userId,
          projectId: data.projectId,
          directionSlug: data.directionSlug,
          signal: req.signal,
        });

        try {
          for await (const event of runAgentLoop({
            goal: data.goal,
            context,
            tools,
          })) {
            if (req.signal.aborted) break;
            controller.enqueue(encoder.encode(sseEncode(event)));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: unknown) {
          log.fail("agent stream error", error);
          controller.enqueue(
            encoder.encode(
              sseEncode({
                type: "agent/error",
                error: getErrorMessage(error),
              }),
            ),
          );
          controller.close();
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
    log.fail("agent request failed", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

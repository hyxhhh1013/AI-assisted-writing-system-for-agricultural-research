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
import {
  createAgentSession,
  getAgentSessionForUser,
  snapshotToInitialState,
} from "@/lib/agent/session-store";

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

    let goal = data.goal?.trim() ?? "";
    let projectId = data.projectId;
    let directionSlug = data.directionSlug;
    let sessionId: string | undefined;
    let resumeState: ReturnType<typeof snapshotToInitialState> | undefined;

    if (data.resume && data.sessionId) {
      const existing = await getAgentSessionForUser(data.sessionId, userId);
      if (!existing) {
        return new Response(JSON.stringify({ error: "会话不存在" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (existing.status !== "interrupted" && existing.status !== "running" && existing.status !== "error") {
        return new Response(
          JSON.stringify({ error: `会话状态为 ${existing.status}，无法续跑` }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      if (!existing.snapshot) {
        return new Response(JSON.stringify({ error: "会话无可用断点快照" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      sessionId = existing.id;
      goal = existing.goal;
      projectId = existing.projectId ?? undefined;
      directionSlug = existing.directionSlug ?? undefined;
      resumeState = snapshotToInitialState(existing.goal, existing.snapshot);
    } else {
      if (!goal) {
        return new Response(JSON.stringify({ error: "目标不能为空" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const created = await createAgentSession({
        userId,
        goal,
        projectId,
        directionSlug,
      });
      sessionId = created.id;
    }

    const stream = new ReadableStream({
      async start(controller) {
        const context = createAgentContext({
          userId,
          projectId,
          directionSlug,
          signal: req.signal,
        });

        if (resumeState) {
          context.budget.currentIteration = resumeState.iteration ?? 0;
          context.budget.toolCallCount = resumeState.toolCallCount ?? 0;
        }

        try {
          for await (const event of runAgentLoop({
            goal,
            context,
            tools,
            sessionId,
            resumeState,
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

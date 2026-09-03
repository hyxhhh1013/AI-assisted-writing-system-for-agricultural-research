import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { validateBody } from "@/lib/api-validate";
import { agentSessionActionSchema } from "@/lib/validations";
import { isAgentEnabled } from "@/lib/agent";
import {
  interruptRunningSession,
  listAgentSessions,
  listProjectAgentHistory,
} from "@/lib/agent/session-store";
import type { AgentSessionStatus } from "@/contracts/agent-session";

const log = createLogger("api/agent/sessions");

export const runtime = "nodejs";

/**
 * GET /api/agent/sessions?projectId=&status=interrupted|completed|all&includeTranscript=1
 * history=1 时按时间正序返回同项目近期会话（含气泡），供聊天历史恢复
 */
export async function GET(req: NextRequest) {
  if (!isAgentEnabled()) {
    return NextResponse.json(
      { error: "Agent 功能未启用，请设置 AGENT_ENABLED=1" },
      { status: 503 },
    );
  }

  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const includeTranscript = searchParams.get("includeTranscript") === "1";
    const asHistory = searchParams.get("history") === "1";

    if (asHistory) {
      if (!projectId) {
        return NextResponse.json({ error: "history=1 需要 projectId" }, { status: 400 });
      }
      const sessions = await listProjectAgentHistory({
        userId,
        projectId,
        limit: 20,
      });
      return NextResponse.json({ sessions });
    }

    const statusRaw = searchParams.get("status") ?? "interrupted";
    const allowed: AgentSessionStatus[] = [
      "running",
      "interrupted",
      "completed",
      "error",
    ];
    const status =
      statusRaw === "all"
        ? undefined
        : allowed.includes(statusRaw as AgentSessionStatus)
          ? (statusRaw as AgentSessionStatus)
          : "interrupted";

    const sessions = await listAgentSessions({
      userId,
      projectId,
      status,
      limit: includeTranscript ? 20 : 10,
      includeTranscript,
    });

    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    log.fail("list sessions failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/** POST /api/agent/sessions — 强制结束仍标 running、但前端已断开的会话 */
export async function POST(req: NextRequest) {
  if (!isAgentEnabled()) {
    return NextResponse.json(
      { error: "Agent 功能未启用，请设置 AGENT_ENABLED=1" },
      { status: 503 },
    );
  }

  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const raw: unknown = await req.json();
    const { data, errorResponse } = await validateBody(agentSessionActionSchema, raw);
    if (errorResponse) return errorResponse;

    const interrupted = await interruptRunningSession(data.sessionId, userId);
    return NextResponse.json({ ok: true, interrupted });
  } catch (error: unknown) {
    log.fail("session action failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

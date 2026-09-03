import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { validateBody } from "@/lib/api-validate";
import { agentSchema } from "@/lib/validations";
import prisma from "@/lib/prisma";
import {
  createAgentContext,
  createAgentTools,
  isAgentEnabled,
  runAgentLoop,
} from "@/lib/agent";
import type { AgentSSEEvent } from "@/contracts/agent";
import type { AttachmentExtractSource } from "@/contracts/agent-attachment";
import { MAX_ATTACHMENT_TEXT_CHARS } from "@/lib/agent/attachments/constants";
import { maybeAutoIngestTabularAttachment } from "@/lib/agent/attachments/auto-ingest";
import { inferAttachmentKind } from "@/lib/agent/attachments/kind";
import { buildAttachmentManifest } from "@/lib/agent/attachments/manifest";
import { buildFollowUpInitialState } from "@/lib/agent/session-continue";
import {
  createAgentSession,
  getAgentSessionForUser,
  interruptRunningSession,
  reclaimStaleRunningSessions,
  snapshotToInitialState,
  tryAcquireAgentSession,
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
    /** resume 续跑时回退的会话附件 id（来自快照，避免清空 traceability） */
    let resumeSnapshotAttachmentIds: string[] | undefined;
    /** 跟聊时前会话快照已记录的附件 id（防快照丢历史附件） */
    let followUpSnapshotAttachmentIds: string[] | undefined;
    let followUp = false;
    let pendingCheckpointKind: import("@/contracts/agent").AgentCheckpointKind | undefined;
    const checkpointDecision = data.checkpointDecision;
    const confirmDecision = data.confirmDecision;

    // 先回收因进程退出而卡死的 running，避免跟聊一直 409
    await reclaimStaleRunningSessions({
      userId,
      projectId,
      sessionId: data.sessionId,
    });

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
      pendingCheckpointKind = existing.snapshot.awaitingCheckpoint?.kind;
      if (
        checkpointDecision
        && existing.snapshot.awaitingCheckpoint
        && checkpointDecision.checkpointId !== existing.snapshot.awaitingCheckpoint.id
      ) {
        return new Response(JSON.stringify({ error: "检查点已过期，请刷新后重试" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      // 前端能点「接上」时本端 SSE 已断；running 先回收再抢占，避免空白 409
      if (existing.status === "running") {
        await interruptRunningSession(existing.id, userId);
      }
      // 原子抢占执行权（interrupted/error → running）；仍 running 才是真并发
      const claim = await tryAcquireAgentSession(data.sessionId, userId);
      if (claim === "conflict") {
        return new Response(
          JSON.stringify({ error: "会话仍在执行中，请稍候或先停止" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      resumeState = snapshotToInitialState(existing.goal, existing.snapshot);
      resumeSnapshotAttachmentIds = existing.snapshot.attachmentIds;
    } else if (data.sessionId && goal) {
      // 同一会话跟聊：completed / interrupted / error 均可接新目标
      const existing = await getAgentSessionForUser(data.sessionId, userId);
      if (!existing) {
        return new Response(JSON.stringify({ error: "会话不存在" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (existing.status === "running") {
        // 跟聊能发出 = 本端 SSE 已断。45s 阈值会让长写节把用户卡在空白 409
        await interruptRunningSession(existing.id, userId);
        const refreshed = await getAgentSessionForUser(data.sessionId, userId);
        if (refreshed?.status === "running") {
          return new Response(
            JSON.stringify({ error: "会话仍在执行中，请稍候或先停止" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      if (!existing.snapshot) {
        return new Response(JSON.stringify({ error: "会话无可用快照，请新开对话" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (existing.projectId && projectId && existing.projectId !== projectId) {
        return new Response(JSON.stringify({ error: "会话与当前项目不匹配" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      sessionId = existing.id;
      projectId = existing.projectId ?? projectId;
      directionSlug = existing.directionSlug ?? directionSlug;
      resumeState = buildFollowUpInitialState(goal, existing.snapshot);
      followUp = true;
      followUpSnapshotAttachmentIds = existing.snapshot.attachmentIds;
      // 原子抢占执行权（completed/interrupted/error → running），同时写入新 goal；
      // 抢占失败说明并发请求已开始跑同一会话 → 409，防双跑
      const claim = await tryAcquireAgentSession(sessionId, userId, {
        goal,
        fromStatuses: ["completed", "interrupted", "error"],
      });
      if (claim === "conflict") {
        return new Response(
          JSON.stringify({ error: "会话仍在执行中，请稍候或先停止" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
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

    // 附件：加载并生成清单（失败降级不阻断对话）
    let attachmentManifest: string | undefined;
    // resume 且客户端不传附件 id 时回退快照（避免清空 traceability）
    let attachmentIds =
      (data.attachmentIds && data.attachmentIds.length > 0)
        ? data.attachmentIds
        : (data.resume ? resumeSnapshotAttachmentIds ?? [] : []);
    // followUp：合并前会话快照已记录的附件 id（防快照丢历史附件）
    if (followUp && followUpSnapshotAttachmentIds?.length) {
      attachmentIds = Array.from(new Set([...attachmentIds, ...followUpSnapshotAttachmentIds]));
    }
    // 首消息回填 sessionId：新对话上传的附件（sessionId=null）归属到本会话，保证 list_attachments 可发现
    if (sessionId && attachmentIds.length > 0) {
      try {
        await prisma.agentAttachment.updateMany({
          where: { id: { in: attachmentIds }, userId, sessionId: null },
          data: { sessionId },
        });
      } catch { /* 回填失败不阻断 */ }
    }
    if (attachmentIds.length > 0) {
      try {
        if (projectId) {
          await prisma.agentAttachment.updateMany({
            where: { id: { in: attachmentIds }, userId, projectId: null },
            data: { projectId },
          });
        }
        const rows = await prisma.agentAttachment.findMany({
          where: { id: { in: attachmentIds }, userId },
        });
        const ingestById = new Map<string, { status: "ingested" | "failed" | "skipped" | "pending"; claimCount?: number }>();
        if (projectId) {
          for (const r of rows) {
            if (r.status !== "ready" || inferAttachmentKind(r.originalName) !== "tabular") continue;
            const view = await maybeAutoIngestTabularAttachment({
              userId,
              projectId,
              attachmentId: r.id,
              fileName: r.originalName,
            });
            ingestById.set(r.id, view);
          }
        }
        attachmentManifest = buildAttachmentManifest(rows.map((r) => ({
          id: r.id, originalName: r.originalName, mimeType: r.mimeType, size: r.size,
          status: r.status, extractSource: r.extractSource as AttachmentExtractSource | null,
          kind: inferAttachmentKind(r.originalName),
          ingest: ingestById.get(r.id) ?? null,
          charCount: r.extractedText?.length ?? 0,
          truncated: (r.extractedText?.length ?? 0) >= MAX_ATTACHMENT_TEXT_CHARS,
          pinned: r.pinned, createdAt: r.createdAt.toISOString(),
        })));
      } catch { /* 清单失败仅降级 */ }
    }

    const stream = new ReadableStream({
      async start(controller) {
        const context = createAgentContext({
          userId,
          sessionId,
          projectId,
          directionSlug,
          signal: req.signal,
        });

        if (resumeState && !followUp) {
          context.budget.currentIteration = resumeState.iteration ?? 0;
          context.budget.toolCallCount = resumeState.toolCallCount ?? 0;
        }
        // followUp：预算从 0 起算（buildFollowUpInitialState 已重置）

        // 客户端断开 / cancel 会先关掉 controller；此后 enqueue/close 会抛
        // TypeError: Controller is already closed。按 writing SSE 同款软关闭，勿记成 agent 失败。
        let streamClosed = false;
        const isControllerClosedError = (error: unknown): boolean =>
          error instanceof TypeError
          && /already closed|Invalid state/i.test(error.message);

        const emitRaw = (chunk: string): boolean => {
          if (streamClosed || req.signal.aborted) return false;
          try {
            controller.enqueue(encoder.encode(chunk));
            return true;
          } catch (error: unknown) {
            streamClosed = true;
            if (!isControllerClosedError(error) && !req.signal.aborted) {
              log.warn("agent sse enqueue failed", {
                error: getErrorMessage(error),
              });
            }
            return false;
          }
        };

        const finishStream = () => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            /* already closed */
          } finally {
            streamClosed = true;
          }
        };

        try {
          for await (const event of runAgentLoop({
            goal,
            context,
            tools,
            sessionId,
            resumeState,
            followUp,
            checkpointDecision,
            confirmDecision,
            pendingCheckpointKind,
            attachmentManifest,
            attachmentIds,
          })) {
            if (req.signal.aborted || streamClosed) break;
            if (!emitRaw(sseEncode(event))) break;
          }
          finishStream();
        } catch (error: unknown) {
          if (isControllerClosedError(error) || req.signal.aborted) {
            finishStream();
            return;
          }
          log.fail("agent stream error", error);
          emitRaw(
            sseEncode({
              type: "agent/error",
              error: getErrorMessage(error),
            }),
          );
          finishStream();
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

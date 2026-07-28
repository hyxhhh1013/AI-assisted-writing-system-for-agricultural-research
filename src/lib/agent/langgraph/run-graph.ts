import type {
  AgentCheckpointDecision,
  AgentConfirmRequest,
  AgentSSEEvent,
} from "@/contracts/agent";
import type { AgentUiMessage } from "@/contracts/agent-session";
import { buildPriorConversationMessages } from "@/lib/agent/conversation-continuity";
import { decisionMessage } from "@/lib/agent/core/checkpoints";
import {
  createAntispamTracker,
  projectFingerprint,
} from "@/lib/agent/core/antispam";
import {
  diagnoseGoalNudge,
  draftGoalNudge,
  isDiagnoseStyleGoal,
  isLiteratureHuntGoal,
  isSectionDraftGoal,
  literatureHuntNudge,
} from "@/lib/agent/core/goal-intents";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { getCompiledAgentGraph } from "@/lib/agent/langgraph/graph";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { appendPhasePackToBriefing } from "@/lib/agent/phase-task-pack";
import { loadAgentProject } from "@/lib/agent/project-loader";
import {
  appendMemoryToBriefing,
  buildRecentAgentMemoryBlock,
} from "@/lib/agent/session-memory";
import {
  graphStateToSnapshot,
} from "@/lib/agent/session-snapshot";
import {
  formatWorkMemoryBlock,
  normalizeWorkMemory,
} from "@/lib/agent/work-memory";
import {
  getAgentSessionForUser,
  listAgentSessions,
  saveAgentSessionSnapshot,
} from "@/lib/agent/session-store";
import {
  appendUiFromAgentEvent,
  normalizeUiTranscript,
  seedUiTranscript,
} from "@/lib/agent/ui-transcript";
import type { AgentLoopOptions } from "@/lib/agent/types";

export async function* runAgentGraphLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  const {
    goal,
    context,
    tools,
    sessionId,
    resumeState,
    followUp,
    checkpointDecision,
    confirmDecision,
    pendingCheckpointKind,
  } = options;
  const graph = getCompiledAgentGraph();
  const repeatTracker = createRepeatTracker();

  if (!context.projectBriefing && context.projectId) {
    try {
      const snap = await loadAgentProject(context.userId, context.projectId);
      context.projectSnapshot = snap;
      context.projectBriefing = appendPhasePackToBriefing(
        formatAgentProjectBriefing(snap),
        snap,
      );
    } catch {
      context.projectSnapshot = null;
      context.projectBriefing = formatAgentProjectBriefing(null);
    }
  }

  const antispamTracker = createAntispamTracker(context.projectSnapshot);

  // 诊断任务跳过跨会话记忆，避免被上轮「待导入文献」带偏
  const diagnoseGoal = isDiagnoseStyleGoal(goal);
  const draftGoal = isSectionDraftGoal(goal);
  const litHuntGoal = isLiteratureHuntGoal(goal);

  // 跟聊已自带完整消息历史，不必再注入跨会话 prior / 记忆（简报仍可保留）
  const memoryPromise =
    !followUp && !diagnoseGoal && context.projectId
      ? buildRecentAgentMemoryBlock(context.userId, context.projectId, {
          excludeSessionId: sessionId,
        }).catch(() => "")
      : Promise.resolve("");

  const priorPromise =
    !resumeState && !followUp && !diagnoseGoal && context.projectId
      ? loadPriorTurns(context.userId, context.projectId, sessionId).catch(() => [])
      : Promise.resolve([]);

  const runtime: AgentGraphRuntime = {
    agentContext: context,
    tools,
    repeatTracker,
    antispamTracker,
  };

  let uiTranscript: AgentUiMessage[] = resumeState
    ? [] // 续跑时下面从 DB 补
    : seedUiTranscript(goal);

  /** 断点上的待确认（以 DB 为准，防客户端篡改 params） */
  let pendingConfirmFromDb: AgentConfirmRequest | null = null;

  let initialState: Partial<AgentGraphStateType> = resumeState
    ? {
        ...resumeState,
        goal,
        events: [],
        finished: false,
        error: null,
        awaitingCheckpoint: null,
        awaitingConfirm: null,
        grantedConfirm: null,
        // 诊断跟聊：清空上轮工具摘要，强制本轮重新 inspect
        ...(followUp && diagnoseGoal ? { toolSummaries: [] as string[] } : {}),
      }
    : {
        goal,
        messages: [
          { role: "user", content: goal },
          ...(diagnoseGoal
            ? [{ role: "user" as const, content: diagnoseGoalNudge() }]
            : litHuntGoal
              ? [{ role: "user" as const, content: literatureHuntNudge(goal) }]
              : draftGoal
                ? [{ role: "user" as const, content: draftGoalNudge(goal) }]
                : []),
        ],
      };

  if (followUp && diagnoseGoal) {
    initialState = {
      ...initialState,
      messages: [
        ...(initialState.messages ?? []),
        { role: "user", content: diagnoseGoalNudge() },
      ],
    };
  }

  if (resumeState && sessionId) {
    try {
      const existing = await getAgentSessionForUser(sessionId, context.userId);
      pendingConfirmFromDb = existing?.snapshot?.awaitingConfirm ?? null;
      uiTranscript = normalizeUiTranscript(existing?.snapshot?.uiTranscript);
      if (uiTranscript.length === 0) {
        uiTranscript = seedUiTranscript(goal);
      }
      const mem = normalizeWorkMemory(existing?.snapshot?.workMemory);
      if (mem) {
        context.workMemory = mem;
        const block = formatWorkMemoryBlock(mem);
        if (block) {
          context.projectBriefing = appendMemoryToBriefing(
            context.projectBriefing ?? "",
            block,
          );
        }
      }
    } catch {
      uiTranscript = seedUiTranscript(goal);
    }
    if (checkpointDecision) {
      const kind =
        pendingCheckpointKind
        ?? (checkpointDecision.checkpointId.includes("config")
          ? "config_confirm"
          : "outline_approve");
      uiTranscript = [
        ...uiTranscript,
        {
          kind: "user",
          text: decisionMessage(kind, checkpointDecision.decision, checkpointDecision.note),
        },
      ];
    } else if (confirmDecision?.approved) {
      uiTranscript = [
        ...uiTranscript,
        { kind: "user", text: `确认执行：${confirmDecision.tool}` },
      ];
    } else if (followUp) {
      uiTranscript = [...uiTranscript, { kind: "user", text: goal }];
    } else {
      uiTranscript = [
        ...uiTranscript,
        { kind: "user", text: "继续上次中断的任务" },
      ];
    }
  }

  if (checkpointDecision) {
    initialState = applyCheckpointDecision(
      initialState,
      checkpointDecision,
      pendingCheckpointKind,
    );
  }

  // 确认批准：优先 DB awaitingConfirm；若竞态丢失则回退客户端带回的 params（同源于 agent/confirm）
  if (confirmDecision?.approved) {
    const pendingConfirm =
      pendingConfirmFromDb
      && pendingConfirmFromDb.tool === confirmDecision.tool
        ? pendingConfirmFromDb
        : confirmDecision.tool
          && confirmDecision.params
          && typeof confirmDecision.params === "object"
          ? {
              tool: confirmDecision.tool,
              params: confirmDecision.params as Record<string, unknown>,
              message: `确认执行：${confirmDecision.tool}`,
            }
          : null;
    if (!pendingConfirm || pendingConfirm.tool !== confirmDecision.tool) {
      yield {
        type: "agent/error",
        error: "没有待确认的操作或已过期，请重新发起检索后再导入",
      };
      if (sessionId) {
        yield {
          type: "agent/session",
          sessionId,
          status: "error",
        };
      }
      return;
    }

    const tool = tools.find((t) => t.name === pendingConfirm.tool);
    if (!tool) {
      yield {
        type: "agent/error",
        error: `未知工具: ${pendingConfirm.tool}`,
      };
      return;
    }

    const trustedParams = {
      ...pendingConfirm.params,
      userConfirmed: true,
    };
    const actionEvent: AgentSSEEvent = {
      type: "agent/action",
      tool: tool.name,
      params: trustedParams,
    };
    yield actionEvent;
    uiTranscript = appendUiFromAgentEvent(uiTranscript, actionEvent);

    let result;
    try {
      result = await tool.execute(trustedParams, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { success: false as const, error: message };
    }

    const obsEvent: AgentSSEEvent = {
      type: "agent/observation",
      tool: tool.name,
      result,
      error: result.success ? undefined : result.error,
    };
    yield obsEvent;
    uiTranscript = appendUiFromAgentEvent(uiTranscript, obsEvent);

    context.budget.toolCallCount += 1;
    const line = result.success
      ? `[${tool.name}] ${result.summary ?? "完成"}`
      : `[${tool.name}] 失败: ${result.error ?? "未知错误"}`;

    if (result.success && context.projectId) {
      try {
        const snap = await loadAgentProject(context.userId, context.projectId);
        context.projectSnapshot = snap;
        context.projectBriefing = appendPhasePackToBriefing(
          formatAgentProjectBriefing(snap),
          snap,
        );
        const memBlock = formatWorkMemoryBlock(context.workMemory ?? null);
        if (memBlock) {
          context.projectBriefing = appendMemoryToBriefing(
            context.projectBriefing,
            memBlock,
          );
        }
        antispamTracker.lastFingerprint = projectFingerprint(snap);
        antispamTracker.stagnantCount = 0;
      } catch {
        /* ignore */
      }
    }

    initialState = {
      ...initialState,
      awaitingConfirm: null,
      grantedConfirm: null,
      toolCallCount: (initialState.toolCallCount ?? 0) + 1,
      toolSummaries: [...(initialState.toolSummaries ?? []), line],
      messages: [
        ...(initialState.messages ?? []),
        {
          role: "user",
          content:
            `【确认】用户已批准。服务端已执行 ${tool.name}：\n`
            + formatToolObservationForLlm(tool.name, result)
            + `\n请用中文向用户说明结果，不要再次调用同一导入。`,
        },
      ],
    };
  }

  const recursionLimit = Math.max(context.budget.maxIterations * 4, 16);
  let lastEventCount = 0;
  let lastPersistedAt = 0;
  let latestState: AgentGraphStateType | null = null;
  /** 串行化落库，避免 void running 覆盖后到的 interrupted（丢掉 awaitingConfirm） */
  let persistChain: Promise<void> = Promise.resolve();

  const persist = (
    state: AgentGraphStateType,
    status?: "running" | "interrupted" | "completed" | "error",
    errorMessage?: string | null,
  ): Promise<void> => {
    if (!sessionId) return Promise.resolve();
    const now = Date.now();
    if (status === "running" && now - lastPersistedAt < 1500) {
      return Promise.resolve();
    }
    lastPersistedAt = now;
    const op = async () => {
      try {
        await saveAgentSessionSnapshot(
          sessionId,
          graphStateToSnapshot(state, uiTranscript, context.workMemory),
          status,
          errorMessage,
        );
      } catch {
        /* ignore */
      }
    };
    persistChain = persistChain.then(op, op);
    // running 不阻塞 SSE；终态必须等链写完
    if (status === "running") return Promise.resolve();
    return persistChain;
  };

  try {
    if (sessionId) {
      yield {
        type: "agent/session",
        sessionId,
        status: "running",
        resumed: Boolean(resumeState) && !followUp,
        toolSummaries: followUp ? undefined : resumeState?.toolSummaries,
      };
    }
    // 立刻推状态，避免前端一直停在本地 planning 无 SSE
    yield { type: "agent/status", status: "planning" };

    // 记忆/历史软超时：过长会让首条气泡明显发僵
    const MEMORY_SOFT_MS = 800;
    const [memory, priorTurns] = await Promise.all([
      Promise.race([
        memoryPromise,
        new Promise<string>((resolve) => {
          setTimeout(() => resolve(""), MEMORY_SOFT_MS);
        }),
      ]),
      Promise.race([
        priorPromise,
        new Promise<Awaited<typeof priorPromise>>((resolve) => {
          setTimeout(() => resolve([]), MEMORY_SOFT_MS);
        }),
      ]),
    ]);
    if (memory) {
      context.projectBriefing = appendMemoryToBriefing(
        context.projectBriefing ?? "",
        memory,
      );
    }
    if (!resumeState && priorTurns.length > 0) {
      initialState = {
        ...initialState,
        messages: [
          ...priorTurns,
          ...(initialState.messages ?? [{ role: "user", content: goal }]),
        ],
      };
    }

    const stream = await graph.stream(initialState, {
      streamMode: "values",
      recursionLimit,
      configurable: { agentRuntime: runtime },
      signal: context.signal,
    });

    for await (const snapshot of stream) {
      const state = snapshot as AgentGraphStateType;
      latestState = state;
      context.budget.toolCallCount = state.toolCallCount;
      context.budget.currentIteration = state.iteration;

      const pending = state.events.slice(lastEventCount);
      for (const event of pending) {
        uiTranscript = appendUiFromAgentEvent(uiTranscript, event);
        yield event;
      }
      lastEventCount = state.events.length;

      // running 快照不阻塞 SSE；终态仍 await 确保持久化
      void persist(state, "running");

      if (context.signal.aborted) {
        await persist(state, "interrupted");
        if (sessionId) {
          yield {
            type: "agent/session",
            sessionId,
            status: "interrupted",
            toolSummaries: state.toolSummaries,
          };
        }
        if (!pending.some((e) => e.type === "agent/status" && e.status === "cancelled")) {
          yield { type: "agent/status", status: "cancelled" };
        }
        return;
      }
    }

    if (latestState) {
      if (latestState.awaitingCheckpoint || latestState.awaitingConfirm) {
        await persist(latestState, "interrupted");
        if (sessionId) {
          yield {
            type: "agent/session",
            sessionId,
            status: "interrupted",
            toolSummaries: latestState.toolSummaries,
          };
        }
        return;
      }
      const terminal: "completed" | "error" = latestState.error ? "error" : "completed";
      await persist(latestState, terminal, latestState.error);
      if (sessionId) {
        yield {
          type: "agent/session",
          sessionId,
          status: terminal,
          toolSummaries: latestState.toolSummaries,
        };
      }
    }
  } catch (error) {
    if (context.signal.aborted) {
      if (latestState && sessionId) {
        await persist(latestState, "interrupted");
        yield {
          type: "agent/session",
          sessionId,
          status: "interrupted",
          toolSummaries: latestState.toolSummaries,
        };
      }
      yield { type: "agent/status", status: "cancelled" };
      return;
    }
    const message = error instanceof Error ? error.message : "Agent 图执行失败";
    if (latestState && sessionId) {
      await persist(latestState, "error", message);
      yield {
        type: "agent/session",
        sessionId,
        status: "error",
        toolSummaries: latestState.toolSummaries,
      };
    }
    yield { type: "agent/error", error: message };
  }
}

async function loadPriorTurns(
  userId: string,
  projectId: string,
  excludeSessionId?: string,
) {
  const recent = await listAgentSessions({
    userId,
    projectId,
    limit: 6,
  });
  const candidates = recent
    .filter((s) => s.id !== excludeSessionId && s.status !== "running")
    .slice(0, 4);
  const details = await Promise.all(
    candidates.map(async (item) => {
      const full = await getAgentSessionForUser(item.id, userId);
      return {
        goal: item.goal,
        status: item.status,
        snapshot: full?.snapshot ?? null,
      };
    }),
  );
  // list 是 updatedAt desc → 转正序给 continuity
  return buildPriorConversationMessages(details.slice().reverse());
}

function applyCheckpointDecision(
  state: Partial<AgentGraphStateType>,
  decision: AgentCheckpointDecision,
  kindHint?: AgentLoopOptions["pendingCheckpointKind"],
): Partial<AgentGraphStateType> {
  const kind =
    kindHint
    ?? (decision.checkpointId.includes("config") ? "config_confirm" : "outline_approve");
  const prev = state.approvedCheckpointKinds ?? [];
  const approved =
    decision.decision === "approve"
      ? Array.from(new Set([...prev, kind]))
      : prev;
  return {
    ...state,
    approvedCheckpointKinds: approved,
    messages: [
      ...(state.messages ?? []),
      {
        role: "user",
        content: decisionMessage(kind, decision.decision, decision.note),
      },
    ],
  };
}

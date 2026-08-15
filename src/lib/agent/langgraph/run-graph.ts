import type {
  AgentCheckpointDecision,
  AgentConfirmRequest,
  AgentSSEEvent,
  AgentToolResult,
} from "@/contracts/agent";
import type { AgentUiMessage } from "@/contracts/agent-session";
import { buildPriorConversationMessages } from "@/lib/agent/conversation-continuity";
import {
  applyCheckpointDecisionPatch,
  decisionMessage,
  resolveCheckpointKind,
} from "@/lib/agent/core/checkpoints";
import {
  createAntispamTracker,
  projectFingerprint,
} from "@/lib/agent/core/antispam";
import {
  isDiagnoseStyleGoal,
  mergeFollowUpGoalHint,
  mergeGoalWithIntentHint,
} from "@/lib/agent/core/goal-intents";
import { classifyIntent } from "@/lib/agent/core/classify-intent";
import { isIntentKind } from "@/contracts/agent-intent";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { getCompiledAgentGraph } from "@/lib/agent/langgraph/graph";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import {
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
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
import { ensurePendingWriteFromActive } from "@/lib/agent/write-resume";

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
    attachmentManifest,
  } = options;
  const graph = getCompiledAgentGraph();
  const repeatTracker = createRepeatTracker();

  if (!context.projectBriefing && context.projectId) {
    await refreshAgentProjectContext(context, { withMemory: false });
    // refresh 内部吞掉 DB 错误保留旧状态；前导无旧简报可保留，需显式兜底
    if (!context.projectBriefing) {
      context.projectSnapshot = null;
      context.projectBriefing = formatAgentProjectBriefing(null);
    }
  }

  const antispamTracker = createAntispamTracker(context.projectSnapshot);

  const previousKind =
    resumeState && isIntentKind(resumeState.intentKind) ? resumeState.intentKind : null;
  const classified = classifyIntent({
    goal,
    observations: followUp ? (resumeState?.observations ?? []) : [],
    previousKind: followUp ? previousKind : null,
  });

  // 诊断任务跳过跨会话记忆，避免被上轮「待导入文献」带偏
  const diagnoseGoal = isDiagnoseStyleGoal(goal) || classified.kind === "diagnose";

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

  /** 实时 SSE 事件队列：agentNode LLM 流式 delta、工具进度透传与 graph 快照流合并用 */
  const liveQueue = new LiveEventQueue();
  runtime.emitLiveEvent = (e) => liveQueue.push(e);
  context.emitLiveEvent = runtime.emitLiveEvent;

  /** 串行化落库（含 write_section activeWrite 补丁，防与 graph persist 互抢） */
  let persistChain: Promise<void> = Promise.resolve();

  context.patchActiveWrite = async (activeWrite) => {
    context.activeWrite = activeWrite;
    if (!sessionId) return;
    const op = async () => {
      try {
        const existing = await getAgentSessionForUser(sessionId, context.userId);
        if (!existing?.snapshot) return;
        await saveAgentSessionSnapshot(
          sessionId,
          { ...existing.snapshot, activeWrite },
          existing.status === "completed" || existing.status === "error"
            ? undefined
            : "running",
        );
      } catch {
        /* ignore */
      }
    };
    persistChain = persistChain.then(op, op);
    await persistChain;
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
        intentKind: classified.kind,
        events: [],
        finished: false,
        error: null,
        awaitingCheckpoint: null,
        awaitingConfirm: null,
        grantedConfirm: null,
        // 诊断跟聊：清空上轮工具摘要与观察，强制本轮重新 inspect
        ...(followUp && diagnoseGoal
          ? { toolSummaries: [] as string[], observations: [] }
          : {}),
      }
    : {
        goal,
        intentKind: classified.kind,
        messages: [
          { role: "user", content: mergeGoalWithIntentHint(goal) },
        ],
      };

  // 附件清单：有清单即注入到"最后一条 user 消息"（fresh / followUp 均适用；纯 resume 无清单不触发）
  if (attachmentManifest && initialState.messages?.length) {
    let lastUserIdx = -1;
    for (let i = initialState.messages.length - 1; i >= 0; i--) {
      if (initialState.messages[i].role === "user") { lastUserIdx = i; break; }
    }
    // 防重复注入：resume 时快照首条 user 消息已带【附件】清单，再注入会双份 → 已含则跳过
    if (
      lastUserIdx >= 0
      && !initialState.messages[lastUserIdx].content.includes("【附件】")
    ) {
      initialState.messages = initialState.messages.map((msg, i) =>
        i === lastUserIdx ? { ...msg, content: `${attachmentManifest}\n\n${msg.content}` } : msg,
      );
    }
  }

  if (followUp) {
    const nudge = mergeFollowUpGoalHint(
      goal,
      initialState.observations ?? [],
      classified.kind,
    );
    if (nudge) {
      initialState = {
        ...initialState,
        messages: [
          ...(initialState.messages ?? []),
          { role: "user", content: nudge },
        ],
      };
    }
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
      // write_section 断点：跟聊清掉；续跑则恢复并补回 pending
      if (followUp) {
        context.activeWrite = null;
        if (existing?.snapshot?.activeWrite) {
          void context.patchActiveWrite?.(null);
        }
      } else {
        context.activeWrite = existing?.snapshot?.activeWrite ?? null;
        initialState = {
          ...initialState,
          pendingToolCalls: ensurePendingWriteFromActive(
            initialState.pendingToolCalls,
            context.activeWrite,
          ),
        };
      }
    } catch {
      uiTranscript = seedUiTranscript(goal);
    }
    if (checkpointDecision) {
      // 与 applyCheckpointDecision / resolveCheckpointKind 同源，避免 clarify 等回退成 outline
      const kind = resolveCheckpointKind(checkpointDecision, pendingCheckpointKind);
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
      // import_reference 确认卡勾选（前端回传；无勾选时不注入）
      ...(Array.isArray(confirmDecision.selectedIndices)
        && confirmDecision.selectedIndices.length > 0
        ? { selectedIndices: confirmDecision.selectedIndices }
        : {}),
    };
    // importItems 可能含大段摘要：只供 execute 用，不塞进 action 事件 / uiTranscript，避免快照膨胀
    const displayParams: Record<string, unknown> = Object.fromEntries(
      Object.entries(trustedParams).filter(([k]) => k !== "importItems"),
    );
    const actionEvent: AgentSSEEvent = {
      type: "agent/action",
      tool: tool.name,
      params: displayParams,
    };
    yield actionEvent;
    uiTranscript = appendUiFromAgentEvent(uiTranscript, actionEvent);

    // 工具执行可能耗时（批量导入等）：实时排空 liveQueue，进度事件即时推送。
    // 否则 emitLiveEvent 积压在队列，要等 execute 结束、graph 启动后才一次性倒出 → 前端只见「进行中」。
    const executeTask = tool.execute(trustedParams, context);
    const executePromise = Promise.resolve(executeTask).then(
      (r) => ({ kind: "result" as const, result: r }),
      (err: unknown) => ({
        kind: "result" as const,
        result: {
          success: false as const,
          error: err instanceof Error ? err.message : String(err),
        },
      }),
    );
    let result: AgentToolResult;
    for (;;) {
      const liveNext = liveQueue
        .next()
        .then((v) => ({ kind: "live" as const, value: v }));
      const raced = await Promise.race([executePromise, liveNext]);
      if (raced.kind === "result") {
        result = raced.result;
        // 丢弃执行期残留的陈旧进度事件，避免观察之后又冒出来
        liveQueue.clear();
        break;
      }
      if (!raced.value.done) {
        yield raced.value.value;
      }
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
        markAgentProjectDirty(context);
        await refreshAgentProjectContext(context, { withMemory: false });
        antispamTracker.lastFingerprint = projectFingerprint(
          context.projectSnapshot ?? undefined,
        );
        antispamTracker.stagnantCount = 0;
      } catch {
        // refresh 内部已吞错，此 catch 仅兜底（无副作用）
        /* ignore */
      }
    }

    initialState = {
      ...initialState,
      awaitingConfirm: null,
      grantedConfirm: null,
      toolCallCount: (initialState.toolCallCount ?? 0) + 1,
      toolSummaries: [...(initialState.toolSummaries ?? []), line],
      observations: [
        ...(initialState.observations ?? []),
        {
          tool: tool.name,
          success: result.success,
          error: result.error,
          data: result.data,
        },
      ],
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

  // 反思节点上线后，每个 write_section 会额外产生 reflect_step + 触发的 agent/tools 节点，
  // 长会话节点数可远超 maxIterations*2；死循环有 read_section 硬停兜底，这里给足余量避免误触
  const recursionLimit = Math.max(
    context.budget.maxIterations * 16,
    context.budget.maxToolCalls * 4,
    512,
  );
  let lastEventCount = 0;
  let lastPersistedAt = 0;
  let latestState: AgentGraphStateType | null = null;

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
          graphStateToSnapshot(
            state,
            uiTranscript,
            context.workMemory,
            options.attachmentIds,
            context.activeWrite ?? null,
          ),
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

    for await (const item of mergeGraphAndLive(stream, liveQueue)) {
      if (item.type === "live") {
        // 实时事件：直接推给前端；action 等需进 uiTranscript（快照/历史气泡），
        // thought_delta / progress 等 appendUiFromAgentEvent 走 default 忽略，不污染快照
        uiTranscript = appendUiFromAgentEvent(uiTranscript, item.event);
        yield item.event;
        continue;
      }
      const state = item.state;
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
  return {
    ...state,
    ...applyCheckpointDecisionPatch(state, decision, kindHint),
  };
}

/** 实时 SSE 事件队列：agentNode LLM 流式 delta 与 graph 快照流合并用 */
export class LiveEventQueue {
  private items: AgentSSEEvent[] = [];
  private waiters: Array<(value: IteratorResult<AgentSSEEvent>) => void> = [];
  private closed = false;
  private pending: Promise<IteratorResult<AgentSSEEvent>> | null = null;

  push(event: AgentSSEEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: event });
    else this.items.push(event);
    this.pending = null;
  }

  close(): void {
    this.closed = true;
    this.pending = null;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined as never });
    }
  }

  /**
   * 丢弃已缓冲但未消费的实时事件（确认续跑执行结束后的陈旧进度等）。
   * 同时摘掉被 Promise.race 抛弃的 waiter：确认执行循环里 `next()` 的败者会残留一个
   * 无人 await 的 waiter，若不清理，恢复后首个实时事件会被它吞掉（事件丢失）。
   */
  clear(): void {
    this.items = [];
    this.pending = null;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined as never });
    }
  }

  next(): Promise<IteratorResult<AgentSSEEvent>> {
    if (this.items.length > 0) {
      return Promise.resolve({ done: false, value: this.items.shift()! });
    }
    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined as never });
    }
    this.pending ??= new Promise((resolve) => {
      this.waiters.push(resolve);
    });
    return this.pending;
  }
}

/** 合并 graph 快照流与实时事件通道：实时事件即时产出，graph 快照按其节奏产出 */
export async function* mergeGraphAndLive(
  graphStream: AsyncIterable<AgentGraphStateType>,
  queue: LiveEventQueue,
): AsyncGenerator<
  | { type: "graph"; state: AgentGraphStateType }
  | { type: "live"; event: AgentSSEEvent }
> {
  const g = graphStream[Symbol.asyncIterator]();
  let gPending: Promise<{ kind: "graph"; value: IteratorResult<AgentGraphStateType> }> | null = null;
  let lPending: Promise<{ kind: "live"; value: IteratorResult<AgentSSEEvent> }> | null = null;

  try {
    while (true) {
      if (!gPending) gPending = g.next().then((value) => ({ kind: "graph" as const, value }));
      if (!lPending) lPending = queue.next().then((value) => ({ kind: "live" as const, value }));
      const r = await Promise.race([gPending, lPending]);
      if (r.kind === "graph") {
        gPending = null;
        if (r.value.done) {
          // graph 结束：先消费竞态 loser 已取出的实时事件（queue.next 有 shift 副作用），再排空剩余后结束
          queue.close();
          if (lPending) {
            const l = await lPending;
            lPending = null;
            if (!l.value.done) yield { type: "live", event: l.value.value };
          }
          for (;;) {
            const l = await queue.next();
            if (l.done) break;
            yield { type: "live", event: l.value };
          }
          return;
        }
        yield { type: "graph", state: r.value.value };
      } else {
        lPending = null;
        if (!r.value.done) yield { type: "live", event: r.value.value };
      }
    }
  } finally {
    queue.close();
  }
}

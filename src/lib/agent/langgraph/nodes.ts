import type { AgentCheckpointRequest, AgentSSEEvent } from "@/contracts/agent";
import { isWriteSectionSettled } from "@/contracts/writing-qa";
import {
  buildAgentBriefingMessage,
  buildAgentSystemPrompt,
} from "@/lib/agent/core/prompts";
import { createPlan } from "@/lib/agent/core/planner";
import {
  callAINonStreamingWithTools,
  callAIStreamingWithTools,
} from "@/lib/agent/core/llm-tools";
import {
  MAX_BREAKS_BEFORE_HARD_STOP,
  noteSearchCall,
  noteToolProgress,
} from "@/lib/agent/core/antispam";
import {
  clearBlockedReads,
  shouldRequestConfirmation,
} from "@/lib/agent/core/safety";
import {
  findTool,
  parseToolArgs,
  toolsToOpenAISchema,
} from "@/lib/agent/core/tool-registry";
import {
  advancePlanAfterTool,
  thoughtAnnouncesUnfinishedTool,
  buildAnnounceToolNudge,
  buildContinueNudge,
  getFocusSubtask,
  markFocusRunning,
  extractUserChoicePrompt,
  planHasPendingWork,
  shouldResetPlanContinueCount,
} from "@/lib/agent/core/plan-progress";
import {
  buildBlueprintCheckpoint,
  buildClarifyCheckpoint,
  buildConfigCheckpoint,
  buildOutlineCheckpoint,
  paperConfigSettled,
  revokeApprovedKind,
  shouldPauseForBlueprintApprove,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
} from "@/lib/agent/core/checkpoints";
import { blueprintPreviewFromToolData } from "@/lib/agent/blueprint-review";
import { outlineTextFromToolData } from "@/lib/agent/outline-review";
import {
  buildPartialWriteRefineCall,
  isPartialWriteResume,
} from "@/lib/agent/write-resume";
import { buildFigureQaPolishNudge } from "@/lib/agent/figure-qa";
import {
  buildChartQaBlockNudge,
  buildMechanismQaBlockNudge,
  buildFigureQaContinueNudge,
  buildIllustrateGenerateCall,
  buildReadFigureQaCall,
  countFigureQaFailsThisRun,
  extractChartQaFindingCodes,
  extractFigureImageUrl,
  FIGURE_BRIEF_QUESTION,
  FIGURE_GENERATE_TOOLS,
  isChartQaBlocked,
  isFigureQaFailObservation,
  isFigureQaNeedsPolish,
  isFigureQaNeedsRegen,
  latestFigurePlotHref,
  pendingFigureRedraw,
  shouldInjectIllustrationAfterQa,
  shouldInjectVisionFigureQa,
  shouldPauseForFigureBrief,
} from "@/lib/agent/figure-loop";
import { phaseShadowReason } from "@/lib/agent/core/phase-flags";
import { decideAfterWall, resolveLlmToolRequest } from "@/lib/agent/core/wall-policy";
import { buildToolConfirmMessage } from "@/lib/agent/confirm-message";
import { isConfirmGranted } from "@/lib/agent/core/confirm-grant";
import {
  ensureNextWritePrerequisite,
  isWriteToolNeedingPrereqs,
  listMissingWritePrereqs,
  type WritePrereqStep,
} from "@/lib/agent/core/ensure-write-prereqs";
import {
  OUTLINE_PREREQ_HOLD_MESSAGE,
  OUTLINE_PREREQ_QUESTION,
  readOutlinePrereqConsent,
} from "@/lib/agent/core/outline-prereq-consent";
import {
  TITLE_PREREQ_HOLD_MESSAGE,
  readTitlePrereqConsent,
  shouldAskTitleBeforeOutline,
  titlePrereqQuestion,
} from "@/lib/agent/core/title-prereq-consent";
import {
  parseLiteratureImportTarget,
  pickIntentNudge,
  pickIntentStopAsk,
  shouldSkipPlanner,
  sumImportedCount,
  type IntentClosureContext,
} from "@/lib/agent/core/goal-intents";
import { buildIngestConfirmParams } from "@/lib/agent/data-confirm";
import { buildImportReferenceConfirmParams } from "@/lib/agent/import-confirm";
import { analyzeReflection, MAX_REFLECT_ROUNDS } from "@/lib/agent/core/reflect";
import { compactAgentMessages } from "@/lib/agent/core/context-compact";
import {
  MAX_INTENT_CONTINUES,
  MAX_PLAN_CONTINUES,
  observationsThisRun,
  shouldContinuePlanWork,
  type AgentGraphStateType,
} from "@/lib/agent/langgraph/state";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import {
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
import { assetLandedInBody } from "@/lib/agent/insert-section";
import { isProjectMutatingTool } from "@/lib/agent/project-mutated";
import { loadAgentPlotSources } from "@/lib/agent/plot-sources";
import { collectChartConfigsFromSources } from "@/contracts/figure";
import {
  buildGenerateChartCallsFromJobs,
  buildNarrativeFigureCalls,
  collectBoundChartJobsForSection,
  formatUnboundBlueprintChartsNudge,
  jobAlreadyCoveredByText,
} from "@/lib/blueprint-chart-jobs";
import type { ParsedToolCall, ToolObservation } from "@/lib/agent/types";
import type { AgentToolTrace } from "@/contracts/agent-session";
import { makeToolTrace, type AgentToolTraceVia } from "@/lib/agent/tool-trace";
import { getAgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  allParallelSafe,
  runParallelReads,
} from "@/lib/agent/langgraph/parallel-tools";
import {
  evaluatePhaseGate,
  evaluatePostGates,
  evaluatePreGates,
  type PostGateInput,
  type PreGateInput,
} from "@/lib/agent/langgraph/tool-gates";

export async function planNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  const { agentContext } = getAgentGraphRuntime(config.configurable);
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "planning" }];

  if (agentContext.signal.aborted) {
    return {
      events: [...events, { type: "agent/status", status: "cancelled" }],
      finished: true,
    };
  }

  try {
    // S2：缺配置时先停（须在「已有 plan 续跑」之前，否则永远看不到问答）
    if (
      shouldPauseForConfigConfirm({
        goal: state.goal,
        intentKind: state.intentKind,
        hasPaperConfig: Boolean(agentContext.projectSnapshot?.hasPaperConfig),
        approvedKinds: state.approvedCheckpointKinds ?? [],
      })
    ) {
      const checkpoint = buildConfigCheckpoint();
      events.push({ type: "agent/checkpoint", checkpoint });
      events.push({ type: "agent/status", status: "awaiting_checkpoint" });
      return {
        events,
        awaitingCheckpoint: checkpoint,
        finished: true,
        messages: [
          {
            role: "assistant",
            content: "等待用户确认论文配置后再继续。",
          },
        ],
      };
    }

    // 续跑：已有 plan 则跳过重新规划
    if (state.plan && state.messages.length > 0) {
      events.push({ type: "agent/status", status: "thinking" });
      return { events };
    }

    // 诊断 / 单节起草 / 引用核查·修正：跳过 Planner LLM，直接对话
    if (shouldSkipPlanner(state.goal, state.observations ?? [], state.intentKind)) {
      events.push({ type: "agent/status", status: "thinking" });
      return { events, plan: null };
    }

    const rawPlan = await createPlan(state.goal, agentContext, agentContext.projectBriefing);
    const plan = markFocusRunning(rawPlan);
    const focus = getFocusSubtask(plan);
    events.push({ type: "agent/plan", plan });
    return {
      plan: { ...plan, focusSubtaskId: focus?.id ?? null },
      events,
      messages: [
        {
          role: "assistant",
          content: `Plan:\n${plan.subtasks.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n")}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "规划失败";
    return {
      error: message,
      events: [...events, { type: "agent/error", error: message }],
      finished: true,
    };
  }
}

const LANDED_CHANGE_TOOLS = new Set([
  "refine_content",
  "update_paper_config",
  "generate_outline",
  "write_bilingual_abstract",
  "import_reference",
  "generate_chart",
  "plot_peak_stack",
  "plot_panel_grid",
  "plot_curve_overlay",
  "draft_mechanism_figure",
  "illustrate_mechanism_figure",
  "apply_revision_item",
  "generate_writing_blueprint",
]);

/**
 * 本轮是否已经动过稿。
 * write_section 被质检拦住（blocked）也算收口，避免「没落地，请再写一节」把同一节打成循环。
 * 配图 QA block 仍不算落地。
 */
export function countsAsLandedMutation(obs: {
  tool: string;
  success: boolean;
  data?: unknown;
}): boolean {
  if (!obs.success) return false;
  if (obs.tool === "write_section") return isWriteSectionSettled(obs.data);
  if (!LANDED_CHANGE_TOOLS.has(obs.tool)) return false;
  return !isChartQaBlocked(obs.data);
}

export async function agentNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  if (state.error || state.finished) {
    return {};
  }

  const runtime = getAgentGraphRuntime(config.configurable);
  const { agentContext, tools } = runtime;
  const events: AgentSSEEvent[] = [];

  if (agentContext.signal.aborted) {
    return {
      events: [{ type: "agent/status", status: "cancelled" }],
      finished: true,
    };
  }

  // 检查点/确认续跑：快照里已有待执行工具时直接放行，勿再调 LLM 覆盖 pending
  // （否则 ensureWritePrereqs 暂停时保留的 write_section 会在 resume 后被冲掉）
  if (state.pendingToolCalls.length > 0) {
    return {
      events: [{ type: "agent/status", status: "executing" }],
    };
  }

  const nextIteration = state.iteration + 1;
  agentContext.budget.currentIteration = nextIteration;

  if (nextIteration > agentContext.budget.maxIterations) {
    return { iteration: nextIteration, finished: true, events };
  }

  events.push({ type: "agent/status", status: "thinking" });
  // 节点返回前 events 不会进 SSE；LLM 可能空转数十秒且无 thought_delta，必须立刻推状态
  runtime.emitLiveEvent?.({ type: "agent/status", status: "thinking" });

  const plan = state.plan ? markFocusRunning(state.plan) : null;
  // 不每轮注入【计划焦点】假 user；改为提前结束时用 buildContinueNudge 轻推（见下方 canContinue）
  const extraMessages: AgentGraphStateType["messages"] = [];

  const llmRequest = resolveLlmToolRequest(tools, state.restrictToolsOnce);
  const systemPrompt = buildAgentSystemPrompt(llmRequest.tools, state.intentKind);
  // 项目简报经独立 user 消息注入（system prompt 前缀恒定 → provider 前缀缓存友好）
  const briefingMsg = buildAgentBriefingMessage(agentContext.projectBriefing);
  // 长会话压缩：超过阈值时把早期轮次的工具观察压成摘要块，控制 LLM 输入长度
  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...(briefingMsg ? [briefingMsg] : []),
    ...compactAgentMessages(state.messages),
    ...extraMessages,
  ];

  let response;
  try {
    // 真流式：逐 token 实时推送 thought_delta；流式失败自动回退非流式
    try {
      response = await callAIStreamingWithTools(
        {
          messages: llmMessages,
          tools: toolsToOpenAISchema(llmRequest.tools),
          toolChoice: llmRequest.toolChoice,
          signal: agentContext.signal,
          userId: agentContext.userId,
          temperature: 0.3,
        },
        (delta) => {
          if (!delta) return;
          runtime.emitLiveEvent?.({ type: "agent/thought_delta", content: delta });
        },
      );
      // 流式退化：既无内容也无工具调用、或工具调用名称为空（流式识别可能失败，
      // 空名会触发「未知工具」→ 重试死循环），回退非流式重试
      const degenerate =
        (!response.content && response.toolCalls.length === 0)
        || response.toolCalls.some((tc) => !tc.name);
      if (degenerate) {
        response = await callAINonStreamingWithTools({
          messages: llmMessages,
          tools: toolsToOpenAISchema(llmRequest.tools),
          toolChoice: llmRequest.toolChoice,
          signal: agentContext.signal,
          userId: agentContext.userId,
          temperature: 0.3,
        });
      }
    } catch {
      response = await callAINonStreamingWithTools({
        messages: llmMessages,
        tools: toolsToOpenAISchema(llmRequest.tools),
        toolChoice: llmRequest.toolChoice,
        signal: agentContext.signal,
        userId: agentContext.userId,
        temperature: 0.3,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM 调用失败";
    return {
      iteration: nextIteration,
      error: message,
      events: [...events, { type: "agent/error", error: message }],
      finished: true,
      messages: [...extraMessages, { role: "user", content: `[System error] ${message}` }],
      plan: plan ?? state.plan,
      ...(llmRequest.clearRestrict ? { restrictToolsOnce: null } : {}),
    };
  }

  const updates: Partial<AgentGraphStateType> = {
    iteration: nextIteration,
    events,
    messages: extraMessages,
    plan: plan
      ? { ...plan, focusSubtaskId: getFocusSubtask(plan)?.id ?? null }
      : state.plan,
    ...(llmRequest.clearRestrict ? { restrictToolsOnce: null } : {}),
  };

  if (response.content) {
    updates.finalThought = response.content;
    updates.messages = [...extraMessages, { role: "assistant", content: response.content }];
    events.push({ type: "agent/thought", content: response.content });
  }

  // 只看有没有解析到工具。部分模型带 tool_calls 仍回 finish_reason=stop，
  // 旧条件会清掉 pendingToolCalls 并提前收尾，界面只剩半截「撰写引言…」。
  if (response.toolCalls.length === 0) {
    // 与 routeAfterAgent 共用同一续跑判断（参数传「更新后」的值，见 shouldContinuePlanWork 文档）
    const canContinue = shouldContinuePlanWork({
      plan,
      iteration: nextIteration,
      planContinueCount: state.planContinueCount + 1,
      toolSummaries: state.toolSummaries,
      maxIterations: agentContext.budget.maxIterations,
      observations: state.observations,
    });

    updates.pendingToolCalls = [];

    const observations = state.observations;
    const thisRun = observationsThisRun(observations, state.intentObsOffset);
    const searchedOk = thisRun.some(
      (o) =>
        (o.tool === "search_external" || o.tool === "search_knowledge")
        && o.success,
    );
    const importCount = sumImportedCount(thisRun);
    const importTarget = parseLiteratureImportTarget(state.goal);
    const refTotal = agentContext.projectSnapshot?.references?.length ?? 0;
    const wroteOk = thisRun.some(
      (o) =>
        o.tool === "write_section"
        && o.success
        && isWriteSectionSettled(o.data),
    );

    // 意图收尾续跑 / 停下问用户：由 goal-intents 的意图表统一驱动（见 pickIntentNudge / pickIntentStopAsk）
    const intentCtx: IntentClosureContext = {
      goal: state.goal,
      observations,
      intentKind: state.intentKind,
      searchedOk,
      importCount,
      importTarget,
      refTotal,
      wroteOk,
    };

    const canIntentContinue = state.planContinueCount < MAX_INTENT_CONTINUES;
    const intentNudge = !canIntentContinue ? null : pickIntentNudge(intentCtx);
    // QA 未通过：优先于计划续跑/收尾，强制再跑一轮工具（避免长篇推演后 finished）
    const figureQaPending = pendingFigureRedraw(observations, state.intentObsOffset);
    const canFigureQaContinue =
      Boolean(figureQaPending)
      && nextIteration < agentContext.budget.maxIterations;

    if (canFigureQaContinue && figureQaPending) {
      updates.finished = false;
      updates.planContinueCount = state.planContinueCount + 1;
      updates.messages = [
        ...(updates.messages ?? extraMessages),
        {
          role: "user",
          content: buildFigureQaContinueNudge(figureQaPending.imageUrl),
        },
      ];
      events.push({ type: "agent/status", status: "executing" });
    } else if (canContinue && plan) {
      updates.finished = false;
      updates.planContinueCount = state.planContinueCount + 1;
      updates.messages = [
        ...(updates.messages ?? extraMessages),
        { role: "user", content: buildContinueNudge(plan) },
      ];
      events.push({ type: "agent/plan", plan: updates.plan! });
    } else if (intentNudge && state.toolSummaries.length > 0) {
      // 与计划续跑同一门卫：开局就停下提问时不强推
      updates.finished = false;
      updates.planContinueCount = state.planContinueCount + 1;
      updates.messages = [
        ...(updates.messages ?? extraMessages),
        { role: "user", content: intentNudge },
      ];
    } else {
      const announced = thoughtAnnouncesUnfinishedTool(response.content, observations);
      if (announced && state.planContinueCount < MAX_PLAN_CONTINUES) {
        updates.finished = false;
        updates.planContinueCount = state.planContinueCount + 1;
        updates.messages = [
          ...(updates.messages ?? extraMessages),
          { role: "user", content: buildAnnounceToolNudge(announced) },
        ];
      } else {
      updates.finished = true;
      // 对话式收尾：意图未完成 → 问用户；有未完成计划 → 提醒可继续（引用修正跟聊不提示旧 plan）
      let hint = pickIntentStopAsk(intentCtx);
      const suppressPlanHint =
        state.intentKind === "ap_full"
        || state.intentKind === "citation_apply"
        || state.intentKind === "citation"
        || state.intentKind === "draft"
        || state.intentKind === "review_write";
      const alreadyAsking = Boolean(extractUserChoicePrompt(updates.finalThought));
      if (!hint && !alreadyAsking && !suppressPlanHint && planHasPendingWork(plan) && plan) {
        const left = plan.subtasks
          .filter((s) => s.status === "pending" || s.status === "running")
          .map((s) => s.title);
        hint =
          `\n\n——\n还有未完成步骤：${left.join("；")}。可以说「继续」接着做「${left[0]}」，或指定下一步。`;
      }
      // 收尾兜底：执行型指令（用户要实际改动）但整轮无落地写操作 → 引导 Agent 用 ask_user 确认，
      // 避免「分析完就当完成」——这是 ask_user 澄清链路的关键触发点
      const execWords =
        /(改|修|调整|优化|更新|修正|refine|执行|按方案|开始|动手|补|删|插入|替换|生成|重写|重画|润色|扩展|处理|弄|配图)/i;
      const writeObs =
        state.intentKind === "draft" || state.intentKind === "review_write"
          ? thisRun
          : observations;
      const landedWrite = writeObs.some((o) => countsAsLandedMutation(o));
      if (
        !hint
        && (execWords.test(state.goal)
          || state.intentKind === "draft"
          || state.intentKind === "review_write")
        && writeObs.length > 0
        && !landedWrite
      ) {
        hint =
          "\n\n——\n这是需要实际改动的任务（写章节/改内容），但你还没落地任何修改。"
          + "若指令有歧义或需要确认修改范围，请调用 ask_user 向用户确认；否则请直接用 write_section / refine_content 落地写，"
          + "并给出下一步。";
      }
      if (hint) {
        if (updates.finalThought) {
          updates.finalThought = `${updates.finalThought}${hint}`;
          updates.messages = [
            ...(updates.messages ?? extraMessages).filter((m) => m.role !== "assistant"),
            { role: "assistant", content: updates.finalThought },
          ];
        } else {
          updates.finalThought = hint.trim();
          updates.messages = [
            ...(updates.messages ?? extraMessages),
            { role: "assistant", content: updates.finalThought },
          ];
          events.push({ type: "agent/thought", content: updates.finalThought });
        }
      }
      }
    }
    return updates;
  }

  updates.pendingToolCalls = response.toolCalls;
  if (shouldResetPlanContinueCount(response.toolCalls.map((c) => c.name))) {
    updates.planContinueCount = 0;
  }
  // reflectCount 不在此重置：仅在 write_section 成功时于 toolsNode 重置，避免「验证→修正→再验证」无限循环
  if (updates.plan) {
    events.push({ type: "agent/plan", plan: updates.plan });
  }
  return updates;
}

/**
 * 自动补齐的前置 step 是否命中批准检查点（大纲/蓝图写回后一律暂停）。
 * 返回检查点请求；未命中返回 null。大纲全文优先 data.outline。
 */
export function buildPrereqCheckpoint(
  state: AgentGraphStateType,
  step: { tool: WritePrereqStep; result: { success: boolean; data?: unknown; summary?: string; error?: string } },
): AgentCheckpointRequest | null {
  if (!step.result.success) return null;
  const approvedKinds = state.approvedCheckpointKinds ?? [];
  const preview =
    step.tool === "generate_writing_blueprint"
      ? blueprintPreviewFromToolData(step.result.data, step.result.summary ?? "")
      : outlineTextFromToolData(step.result.data, step.result.summary ?? "");
  if (
    step.tool === "generate_outline"
    && shouldPauseForOutlineApprove({
      goal: state.goal,
      toolName: "generate_outline",
      toolSuccess: true,
      persisted: true,
      approvedKinds,
    })
  ) {
    return buildOutlineCheckpoint(preview);
  }
  if (
    step.tool === "generate_writing_blueprint"
    && shouldPauseForBlueprintApprove({
      goal: state.goal,
      toolName: step.tool,
      toolSuccess: true,
      persisted: true,
      approvedKinds,
    })
  ) {
    return buildBlueprintCheckpoint(preview);
  }
  return null;
}

export async function toolsNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  if (state.error || state.finished || state.pendingToolCalls.length === 0) {
    return { pendingToolCalls: [] };
  }

  const runtime = getAgentGraphRuntime(config.configurable);
  const { agentContext, tools, repeatTracker, antispamTracker } = runtime;
  // 纯读批次快路径：全部调用可并行时并发执行（结果按原顺序），其余走下方串行循环
  if (allParallelSafe(state.pendingToolCalls, tools)) {
    return await runParallelReads(state, runtime);
  }
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "executing" }];
  const newMessages: AgentGraphStateType["messages"] = [];
  const newSummaries: string[] = [];
  const newObservations: ToolObservation[] = [];
  /** 本轮工具轨迹（W3-AP-ARCH-02）：每次调用结局 append，节点结束随 state 截断 */
  const newTrace: AgentToolTrace[] = [];
  const trace = (
    toolName: string,
    ok: boolean,
    extra?: { reason?: string | null; via?: AgentToolTraceVia; ms?: number },
  ) => {
    newTrace.push(
      makeToolTrace({
        tool: toolName,
        ok,
        intentKind: state.intentKind ?? null,
        reason: extra?.reason,
        via: extra?.via,
        ms: extra?.ms,
      }),
    );
  };
  /** 本轮是否有 write_section 成功写回：新写入需重新给反思预算 */
  let reflectReset = false;
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let finished = false;
  let plan = state.plan;
  let grantedConfirm = state.grantedConfirm ?? null;

  const configBlocksStructure = Boolean(agentContext.projectSnapshot)
    && !paperConfigSettled({
      hasPaperConfig: Boolean(agentContext.projectSnapshot?.hasPaperConfig),
      approvedKinds: state.approvedCheckpointKinds ?? [],
    });
  const pauseForPaperConfig = (fromIdx: number): Partial<AgentGraphStateType> => {
    const checkpoint = buildConfigCheckpoint();
    events.push({ type: "agent/checkpoint", checkpoint });
    events.push({ type: "agent/status", status: "awaiting_checkpoint" });
    return {
      pendingToolCalls: toolQueue.slice(fromIdx),
      toolCallCount,
      toolSummaries: newSummaries,
      observations: newObservations,
      messages: newMessages,
      events,
      plan,
      toolTrace: newTrace,
      awaitingCheckpoint: checkpoint,
      finished: true,
    };
  };

  /** 门禁失败统一记录：摘要 + LLM 消息 + SSE observation + 计划标记失败 */
  const rejectGate = (toolName: string, error: string) => {
    trace(toolName, false, { reason: error, via: "pre-gate" });
    newSummaries.push(`[${toolName}] 失败: ${error}`);
    newMessages.push({
      role: "user",
      content: `Tool result (${toolName}):\n${error}`,
    });
    events.push({
      type: "agent/observation",
      tool: toolName,
      result: { success: false, error },
      error,
    });
    plan = advancePlanAfterTool(plan, toolName, false);
  };

  // 可变队列：出图成功后可 splice 注入 read_figure(qa)
  const toolQueue: ParsedToolCall[] = [...state.pendingToolCalls];
  for (let tcIdx = 0; tcIdx < toolQueue.length; tcIdx++) {
    const toolCall = toolQueue[tcIdx];
    if (!toolCall) continue;
    if (agentContext.budget.toolCallCount >= agentContext.budget.maxToolCalls) {
      error = `单次任务最多调用 ${agentContext.budget.maxToolCalls} 次工具`;
      events.push({ type: "agent/error", error });
      trace(toolCall.name, false, { reason: error, via: "budget" });
      finished = true;
      break;
    }

    const tool = findTool(tools, toolCall.name);
    if (!tool) {
      const msg = `未知工具: ${toolCall.name}`;
      trace(toolCall.name, false, { reason: msg, via: "unknown" });
      newSummaries.push(`[${toolCall.name}] 失败: ${msg}`);
      newMessages.push({ role: "user", content: `Tool result (${toolCall.name}):\n${msg}` });
      events.push({
        type: "agent/observation",
        tool: toolCall.name,
        result: { success: false, error: msg },
        error: msg,
      });
      newObservations.push({ tool: toolCall.name, success: false, error: msg });
      continue;
    }

    let params = parseToolArgs(toolCall.args);

    // 多张机理图任务：首次出图前 clarify FigureBrief（个性化版式/素材）
    if (
      shouldPauseForFigureBrief({
        toolName: tool.name,
        params,
        goal: state.goal,
        messages: [...state.messages, ...newMessages],
      })
    ) {
      const checkpoint = buildClarifyCheckpoint(FIGURE_BRIEF_QUESTION);
      events.push({
        type: "agent/action",
        tool: "ask_user",
        params: { question: FIGURE_BRIEF_QUESTION, figureBrief: true },
      });
      events.push({
        type: "agent/observation",
        tool: "ask_user",
        result: {
          success: true,
          summary: "出图前需确认版式与个性化要点",
          data: { needClarification: true, question: FIGURE_BRIEF_QUESTION },
        },
      });
      newObservations.push({
        tool: "ask_user",
        success: true,
        data: { needClarification: true, question: FIGURE_BRIEF_QUESTION, figureBrief: true },
      });
      events.push({ type: "agent/checkpoint", checkpoint });
      events.push({ type: "agent/status", status: "awaiting_checkpoint" });
      return {
        // 保留当前出图调用，用户回答后继续
        pendingToolCalls: toolQueue.slice(tcIdx),
        toolCallCount,
        toolSummaries: newSummaries,
        observations: newObservations,
        messages: newMessages,
        events,
        plan,
        toolTrace: newTrace,
        awaitingCheckpoint: checkpoint,
        finished: true,
      };
    }

    // 前置门禁链（重复 / 检索配额 / 意图+先读后写）：
    // soft → 记 observation 继续下一个工具；reject → 记失败继续；hard → agent/error 停本轮
    const shadowReason = phaseShadowReason(tool.name, agentContext);
    if (shadowReason) {
      trace(tool.name, true, { via: "phase-shadow", reason: shadowReason });
    }

    const gateInput: PreGateInput = {
      tool,
      params,
      state,
      agentContext,
      repeatTracker,
      antispamTracker,
      recentObservations: [...state.observations, ...newObservations],
    };
    const gateVerdict = evaluatePreGates(gateInput);
    if (!gateVerdict.ok) {
      if (gateVerdict.kind === "hard") {
        trace(tool.name, false, { reason: gateVerdict.error, via: "pre-gate" });
        error = gateVerdict.error;
        events.push({ type: "agent/error", error });
        finished = true;
        break;
      }
      if (gateVerdict.kind === "soft") {
        trace(tool.name, false, { reason: gateVerdict.error, via: "pre-gate" });
        newSummaries.push(`[${tool.name}] ${gateVerdict.error}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${gateVerdict.error}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: gateVerdict.error },
          error: gateVerdict.error,
        });
        continue;
      }
      rejectGate(tool.name, gateVerdict.error);
      continue;
    }

    if (tool.name === "generate_outline") {
      const currentTitle = agentContext.projectSnapshot?.title ?? "";
      const recentObs = [...state.observations, ...newObservations];
      if (
        shouldAskTitleBeforeOutline({
          goal: state.goal,
          intentKind: state.intentKind,
          title: currentTitle,
          observations: recentObs,
        })
      ) {
        const consent = readTitlePrereqConsent(state.messages, currentTitle);
        if (consent.kind === "unset") {
          const checkpoint = buildClarifyCheckpoint(titlePrereqQuestion(currentTitle));
          events.push({ type: "agent/checkpoint", checkpoint });
          events.push({ type: "agent/status", status: "awaiting_checkpoint" });
          return {
            pendingToolCalls: toolQueue.slice(tcIdx),
            toolCallCount,
            toolSummaries: newSummaries,
            observations: newObservations,
            messages: newMessages,
            events,
            plan,
            toolTrace: newTrace,
            awaitingCheckpoint: checkpoint,
            finished: true,
          };
        }
        if (consent.kind === "hold") {
          newSummaries.push(`[${tool.name}] ${TITLE_PREREQ_HOLD_MESSAGE}`);
          newMessages.push({
            role: "user",
            content: TITLE_PREREQ_HOLD_MESSAGE,
          });
          events.push({
            type: "agent/observation",
            tool: tool.name,
            result: { success: false, error: TITLE_PREREQ_HOLD_MESSAGE },
            error: TITLE_PREREQ_HOLD_MESSAGE,
          });
          trace(tool.name, false, { reason: TITLE_PREREQ_HOLD_MESSAGE, via: "pre-gate" });
          return {
            pendingToolCalls: [],
            toolCallCount,
            toolSummaries: newSummaries,
            observations: newObservations,
            messages: newMessages,
            events,
            plan,
            toolTrace: newTrace,
            finalThought: TITLE_PREREQ_HOLD_MESSAGE,
            finished: true,
          };
        }
        if (consent.kind === "title") {
          params = { ...params, confirmedTitle: consent.title };
        }
      }
    }

    // 写节前补大纲/蓝图。缺大纲先问用户；生成后大纲和蓝图都暂停等人批准。
    if (isWriteToolNeedingPrereqs(tool.name)) {
      const prereqRan: string[] = [];
      let prereqErr: string | null = null;
      let prereqPaused = false;

      while (!prereqPaused) {
        const missing = listMissingWritePrereqs(agentContext.projectSnapshot);
        if (
          configBlocksStructure
          && (missing[0] === "generate_outline" || missing[0] === "generate_writing_blueprint")
        ) {
          return pauseForPaperConfig(tcIdx);
        }
        let outlineExtra: Record<string, unknown> | undefined;
        if (missing[0] === "generate_outline") {
          const currentTitle = agentContext.projectSnapshot?.title ?? "";
          const recentObs = [...state.observations, ...newObservations];
          if (
            shouldAskTitleBeforeOutline({
              goal: state.goal,
              intentKind: state.intentKind,
              title: currentTitle,
              observations: recentObs,
            })
          ) {
            const titleConsent = readTitlePrereqConsent(state.messages, currentTitle);
            if (titleConsent.kind === "unset") {
              const checkpoint = buildClarifyCheckpoint(titlePrereqQuestion(currentTitle));
              events.push({ type: "agent/checkpoint", checkpoint });
              events.push({ type: "agent/status", status: "awaiting_checkpoint" });
              return {
                pendingToolCalls: toolQueue.slice(tcIdx),
                toolCallCount,
                toolSummaries: newSummaries,
                observations: newObservations,
                messages: newMessages,
                events,
                plan,
                toolTrace: newTrace,
                awaitingCheckpoint: checkpoint,
                finished: true,
              };
            }
            if (titleConsent.kind === "hold") {
              newSummaries.push(`[${tool.name}] ${TITLE_PREREQ_HOLD_MESSAGE}`);
              newMessages.push({
                role: "user",
                content: TITLE_PREREQ_HOLD_MESSAGE,
              });
              events.push({
                type: "agent/observation",
                tool: tool.name,
                result: { success: false, error: TITLE_PREREQ_HOLD_MESSAGE },
                error: TITLE_PREREQ_HOLD_MESSAGE,
              });
              trace(tool.name, false, { reason: TITLE_PREREQ_HOLD_MESSAGE, via: "pre-gate" });
              return {
                pendingToolCalls: [],
                toolCallCount,
                toolSummaries: newSummaries,
                observations: newObservations,
                messages: newMessages,
                events,
                plan,
                toolTrace: newTrace,
                finalThought: TITLE_PREREQ_HOLD_MESSAGE,
                finished: true,
              };
            }
            if (titleConsent.kind === "title") {
              outlineExtra = { ...(outlineExtra ?? {}), confirmedTitle: titleConsent.title };
            }
          }
          const consent = readOutlinePrereqConsent(state.messages);
          if (consent.kind === "unset") {
            const checkpoint = buildClarifyCheckpoint(OUTLINE_PREREQ_QUESTION);
            events.push({ type: "agent/checkpoint", checkpoint });
            events.push({ type: "agent/status", status: "awaiting_checkpoint" });
            return {
              pendingToolCalls: toolQueue.slice(tcIdx),
              toolCallCount,
              toolSummaries: newSummaries,
              observations: newObservations,
              messages: newMessages,
              events,
              plan,
              toolTrace: newTrace,
              awaitingCheckpoint: checkpoint,
              finished: true,
            };
          }
          if (consent.kind === "hold") {
            newSummaries.push(`[${tool.name}] ${OUTLINE_PREREQ_HOLD_MESSAGE}`);
            newMessages.push({
              role: "user",
              content: OUTLINE_PREREQ_HOLD_MESSAGE,
            });
            events.push({
              type: "agent/observation",
              tool: tool.name,
              result: { success: false, error: OUTLINE_PREREQ_HOLD_MESSAGE },
              error: OUTLINE_PREREQ_HOLD_MESSAGE,
            });
            trace(tool.name, false, { reason: OUTLINE_PREREQ_HOLD_MESSAGE, via: "pre-gate" });
            return {
              pendingToolCalls: [],
              toolCallCount,
              toolSummaries: newSummaries,
              observations: newObservations,
              messages: newMessages,
              events,
              plan,
              toolTrace: newTrace,
              finalThought: OUTLINE_PREREQ_HOLD_MESSAGE,
              finished: true,
            };
          }
          if (consent.kind === "skeleton") {
            outlineExtra = { ...(outlineExtra ?? {}), userSkeleton: consent.skeleton };
          }
        }

        const ensured = await ensureNextWritePrerequisite(
          agentContext,
          tools,
          () => {
            markAgentProjectDirty(agentContext);
            return refreshAgentProjectContext(agentContext);
          },
          outlineExtra,
        );
        toolCallCount = agentContext.budget.toolCallCount;

        for (const step of ensured.steps) {
          events.push({
            type: "agent/action",
            tool: step.tool,
            params: { persistToProject: true, autoPrereq: true },
          });
          trace(step.tool, step.result.success, {
            reason: step.result.success ? undefined : step.result.error,
            via: step.result.success ? "ok" : "fail",
          });
          const stepLine = step.result.success
            ? `[${step.tool}] ${step.result.summary ?? "自动补齐完成"}`
            : `[${step.tool}] 失败: ${step.result.error ?? "未知错误"}`;
          newSummaries.push(stepLine);
          newMessages.push({
            role: "user",
            content: formatToolObservationForLlm(step.tool, step.result),
          });
          events.push({
            type: "agent/observation",
            tool: step.tool,
            result: step.result,
            error: step.result.success ? undefined : step.result.error,
          });
          newObservations.push({
            tool: step.tool,
            success: step.result.success,
            error: step.result.error,
            data: step.result.data,
          });
          plan = advancePlanAfterTool(plan, step.tool, step.result.success);
          noteToolProgress(
            antispamTracker,
            step.tool,
            agentContext.projectSnapshot,
            step.result.success,
          );
          if (step.result.success) prereqRan.push(step.tool);

          // 命中批准检查点（ap-full 目标 + outline/blueprint 未批准）→ 暂停等用户
          const cp = buildPrereqCheckpoint(state, step);
          if (cp) {
            prereqPaused = true;
            events.push({ type: "agent/checkpoint", checkpoint: cp });
            events.push({ type: "agent/status", status: "awaiting_checkpoint" });
            return {
              // 保留当前 toolCall（write_section 等）及剩余待处理调用，resume 后重跑
              pendingToolCalls: toolQueue.slice(tcIdx),
              toolCallCount,
              toolSummaries: newSummaries,
              observations: newObservations,
              messages: newMessages,
              events,
              plan,
              toolTrace: newTrace,
              awaitingCheckpoint: cp,
              finished: true,
            ...((cp.kind === "outline_approve" || cp.kind === "blueprint_approve")
              ? {
                  approvedCheckpointKinds: revokeApprovedKind(
                    state.approvedCheckpointKinds ?? [],
                    cp.kind,
                  ),
                }
              : {}),
            };
          }
        }

        if (!ensured.ok) {
          prereqErr = ensured.error ?? "自动补齐写作前置失败，请先生成大纲与蓝图";
          break;
        }
        if (ensured.ran.length === 0) break; // 前置已齐
      }

      if (prereqErr) {
        newSummaries.push(`[${tool.name}] 失败: ${prereqErr}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${prereqErr}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: prereqErr },
          error: prereqErr,
        });
        plan = advancePlanAfterTool(plan, tool.name, false);
        continue;
      }
      if (prereqRan.length > 0) {
        newMessages.push({
          role: "user",
          content:
            `【系统】已自动补齐写作前置（${prereqRan.join(" → ")}），继续执行 ${tool.name}。`,
        });
      }
    }

    if (
      configBlocksStructure
      && (tool.name === "generate_outline" || tool.name === "generate_writing_blueprint")
    ) {
      return pauseForPaperConfig(tcIdx);
    }

    // 阶段门禁在写前置补齐之后执行（原顺序）：与当前项目阶段不匹配 → 拒绝
    const phaseVerdict = evaluatePhaseGate(gateInput);
    if (!phaseVerdict.ok) {
      rejectGate(tool.name, phaseVerdict.error);
      continue;
    }

    // 不需确认的工具：action 走实时通道，长时工具（write_section 等）执行期间前端即时显示工具卡，
    // 而不是等节点结束、graph 快照 emit 才收到（那会滞后 30-60s）。
    // 需确认工具保留 events.push：确认前 action 随快照 emit；用户确认后由 run-graph 确认路径直接 yield。
    if (shouldRequestConfirmation(tool)) {
      events.push({ type: "agent/action", tool: tool.name, params });
    } else {
      runtime.emitLiveEvent?.({ type: "agent/action", tool: tool.name, params });
    }

    // 忽略模型自带的 userConfirmed；仅服务端 grantedConfirm 可放行
    if (shouldRequestConfirmation(tool)) {
      const granted = isConfirmGranted(grantedConfirm, tool.name, params);
      if (!granted) {
        const confirmParams =
          tool.name === "import_reference"
            ? await buildImportReferenceConfirmParams(params, agentContext)
            : tool.name === "ingest_project_data"
              ? await buildIngestConfirmParams(params, agentContext)
              : params;
        const { message, preview } = buildToolConfirmMessage(tool.name, confirmParams);
        const confirmReq = {
          tool: tool.name,
          params: confirmParams,
          message,
          ...(preview ? { preview } : {}),
        };
        events.push({
          type: "agent/confirm",
          ...confirmReq,
        });
        newSummaries.push(`[${tool.name}] 等待用户确认`);
        newMessages.push({
          role: "user",
          content:
            `Tool result (${tool.name}):\n需要用户在界面确认后才能执行。请等待确认，不要自行填写 userConfirmed。`,
        });
        if (plan) {
          const focus = getFocusSubtask(plan);
          plan = { ...plan, focusSubtaskId: focus?.id ?? null };
          events.push({ type: "agent/plan", plan });
        }
        return {
          // 确认工具由 run-graph 批准路径执行；保留后续同批调用，resume 后继续
          pendingToolCalls: toolQueue.slice(tcIdx + 1),
          toolCallCount,
          toolSummaries: newSummaries,
          observations: newObservations,
          messages: newMessages,
          events,
          plan,
          toolTrace: newTrace,
          ...(reflectReset ? { reflectCount: 0 } : {}),
          awaitingConfirm: confirmReq,
          grantedConfirm: null,
          finished: true,
        };
      }
      params = { ...params, userConfirmed: true };
      grantedConfirm = null;
    }

    agentContext.budget.toolCallCount += 1;
    toolCallCount += 1;
    noteSearchCall(antispamTracker, tool.name);
    agentContext.intentKind = state.intentKind ?? agentContext.intentKind;
    agentContext.goal = state.goal || agentContext.goal;

    try {
      const startedAt = Date.now();
      const result = await tool.execute(params, agentContext);
      trace(tool.name, result.success, {
        reason: result.success ? undefined : result.error,
        via: result.success ? "ok" : "fail",
        ms: Date.now() - startedAt,
      });
      const line = result.success
        ? `[${tool.name}] ${result.summary ?? "完成"}`
        : `[${tool.name}] 失败: ${result.error ?? "未知错误"}`;
      newSummaries.push(line);
      newMessages.push({
        role: "user",
        content: formatToolObservationForLlm(tool.name, result),
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result,
        error: result.success ? undefined : result.error,
      });
      newObservations.push({
        tool: tool.name,
        success: result.success,
        error: result.error,
        data: result.data,
      });
      if (result.success && tool.name === "write_section") reflectReset = true;
      plan = advancePlanAfterTool(plan, tool.name, result.success);
      if (result.success && isProjectMutatingTool(tool.name)) {
        markAgentProjectDirty(agentContext);
        await refreshAgentProjectContext(agentContext);
        // 项目有实际写进展：放行被隔离的读章节
        clearBlockedReads(repeatTracker);
      }

      // 撞墙：本轮连续几张图都没过质检 → 停下给选项，不再塞「必须重画」让模型换说法重掷
      const lastObs = newObservations[newObservations.length - 1];
      if (lastObs && isFigureQaFailObservation(lastObs)) {
        const allObs = [...state.observations, ...newObservations];
        const wall = decideAfterWall({
          kind: "figure_qa",
          hits: countFigureQaFailsThisRun(allObs, state.intentObsOffset),
          plotHref: latestFigurePlotHref(allObs) ?? undefined,
        });
        if (wall.kind === "ask") {
          trace("figure_qa_wall", false, { reason: wall.reason, via: "post-gate" });
          newSummaries.push(`[figure-loop] ${wall.reason}，等用户选择`);
          const checkpoint = buildClarifyCheckpoint(wall.question);
          events.push({ type: "agent/checkpoint", checkpoint });
          events.push({ type: "agent/status", status: "awaiting_checkpoint" });
          return {
            pendingToolCalls: toolQueue
              .slice(tcIdx + 1)
              .filter((c) => !FIGURE_GENERATE_TOOLS.has(c.name) && c.name !== "read_figure"),
            toolCallCount,
            toolSummaries: newSummaries,
            observations: newObservations,
            messages: newMessages,
            events,
            plan,
            toolTrace: newTrace,
            ...(reflectReset ? { reflectCount: 0 } : {}),
            awaitingCheckpoint: checkpoint,
            finished: true,
          };
        }
        if (wall.kind === "run") {
          trace("figure_qa", false, { reason: wall.reason, via: "wall" });
          toolQueue.splice(tcIdx + 1, 0, wall.call);
        } else if (wall.kind === "restrict") {
          trace("figure_qa", false, { reason: wall.reason, via: "wall" });
          return {
            pendingToolCalls: toolQueue.slice(tcIdx + 1),
            restrictToolsOnce: wall.tools,
            toolCallCount,
            toolSummaries: newSummaries,
            observations: newObservations,
            messages: newMessages,
            events,
            plan,
            toolTrace: newTrace,
            ...(reflectReset ? { reflectCount: 0 } : {}),
            finished: false,
          };
        }
      }

      // partial 断点复用跳过了 Verifier/Refiner → 硬排队 refine_content
      if (
        result.success
        && tool.name === "write_section"
        && isPartialWriteResume(result.data)
      ) {
        const section = String(
          (result.data as { section?: unknown })?.section
            ?? toolCall.args?.section
            ?? "",
        ).trim();
        if (section) {
          const alreadyQueued = toolQueue
            .slice(tcIdx + 1)
            .some(
              (c) =>
                c.name === "refine_content"
                && String(c.args.section ?? "").trim() === section,
            );
          if (!alreadyQueued) {
            toolQueue.splice(tcIdx + 1, 0, buildPartialWriteRefineCall(section));
            newSummaries.push(
              `[write-resume] 已自动排队 refine_content → ${section}`,
            );
            newMessages.push({
              role: "user",
              content:
                `System: 断点续写复用了 ${section} 的未完整管道草稿，已自动排队 refine_content 补跑核查润色。`
                + "请等待该工具完成后再向用户汇报；勿再无故重跑 write_section。",
            });
          }
        }
      }

      // 写节落库后：蓝图已绑定试验数据的数据图自动排队 generate_chart（不靠 Writer 吐 FIGURE JSON）
      if (
        result.success
        && tool.name === "write_section"
        && !isPartialWriteResume(result.data)
        && agentContext.projectId
      ) {
        const writeData = (result.data ?? {}) as {
          blocked?: unknown;
          persisted?: unknown;
          section?: unknown;
          draft?: unknown;
        };
        const section = String(
          writeData.section ?? toolCall.args?.section ?? "",
        ).trim();
        const persisted = Boolean(writeData.persisted);
        const blocked = writeData.blocked === true;
        if (section && persisted && !blocked) {
          const plot = await loadAgentPlotSources(
            agentContext.userId,
            agentContext.projectId,
          );
          const configs = plot
            ? collectChartConfigsFromSources(plot.sources)
            : [];
          const subsectionTitle = String(
            toolCall.args?.subsectionTitle ?? "",
          ).trim() || undefined;
          const draft = typeof writeData.draft === "string" ? writeData.draft : "";
          const { jobs, unboundRequired } = collectBoundChartJobsForSection({
            blueprint: agentContext.projectSnapshot?.globalContext?.blueprint ?? null,
            sectionKey: section,
            mode: agentContext.projectSnapshot?.mode,
            subsectionTitle,
            chartConfigs: configs,
          });
          const uncovered = jobs.filter((j) => !jobAlreadyCoveredByText(draft, j));
          const chartCalls = buildGenerateChartCallsFromJobs(
            uncovered,
            section,
            toolQueue.slice(tcIdx + 1),
          );
          if (chartCalls.length > 0) {
            toolQueue.splice(tcIdx + 1, 0, ...chartCalls);
            newSummaries.push(
              `[blueprint-chart] 已自动排队 generate_chart × ${chartCalls.length} → ${section}`,
            );
            newMessages.push({
              role: "user",
              content:
                `System: 本节写作蓝图已绑定试验数据，已自动排队 generate_chart 插入 ${section}。`
                + "请等待出图完成；qaReport=block 时按 findings 改 Spec 重出，不要编造数值。",
            });
          }
          const unboundNudge = formatUnboundBlueprintChartsNudge(unboundRequired);
          if (unboundNudge) {
            newMessages.push({ role: "user", content: unboundNudge });
            newSummaries.push("[blueprint-chart] 蓝图必需图缺数据绑定，已提示上传");
          }
          const figureCalls = buildNarrativeFigureCalls({
            blueprint: agentContext.projectSnapshot?.globalContext?.blueprint ?? null,
            sectionKey: section,
            mode: agentContext.projectSnapshot?.mode,
            subsectionTitle,
            draft,
            alreadyQueued: toolQueue.slice(tcIdx + 1),
          });
          if (figureCalls.length > 0) {
            toolQueue.splice(tcIdx + 1 + chartCalls.length, 0, ...figureCalls);
            newSummaries.push(
              `[blueprint-figure] 已自动排队示意图/对比表 × ${figureCalls.length} → ${section}`,
            );
            newMessages.push({
              role: "user",
              content:
                `System: 本节蓝图里的示意图或对比表已自动排队 ${figureCalls.length} 项。`
                + "不要改成上传 CSV。完成后正文里应能看到对应图题或表题。",
            });
          }
        }
      }

      // 机理图：出图后硬注入 read_figure(qa)。block 未出图则不跑识图。数据图看 qaReport。
      if (
        result.success
        && shouldInjectVisionFigureQa(tool.name)
        && !isChartQaBlocked(result.data)
      ) {
        const imageUrl = extractFigureImageUrl(result);
        if (imageUrl) {
          const qaCall = buildReadFigureQaCall(imageUrl);
          const alreadyQueued = toolQueue
            .slice(tcIdx + 1)
            .some(
              (c) =>
                c.name === "read_figure"
                && String(c.args.imageUrl ?? "") === imageUrl
                && String(c.args.mode ?? "") === "qa",
            );
          if (!alreadyQueued) {
            toolQueue.splice(tcIdx + 1, 0, qaCall);
            newSummaries.push(
              `[figure-loop] 已自动排队 read_figure(qa) → ${imageUrl}`,
            );
            newMessages.push({
              role: "user",
              content:
                `System: 刚生成的机理图已自动排队识图质检 read_figure(mode=qa, imageUrl=${imageUrl})。`
                + "若 QA 判定需重生成，下一轮必须带 replaceImageUrl 重画，禁止同标题无 replace 再 append。",
            });
          }
        }
      } else if (result.success && (tool.name === "generate_chart" || tool.name === "plot_peak_stack" || tool.name === "plot_panel_grid" || tool.name === "plot_curve_overlay") && isChartQaBlocked(result.data)) {
        const imageUrl = extractFigureImageUrl(result) ?? "";
        newMessages.push({
          role: "user",
          content: buildChartQaBlockNudge(imageUrl, extractChartQaFindingCodes(result.data)),
        });
        newSummaries.push("[figure-loop] 数据图 qaReport=block：按 findings 改 Spec 重出");
      } else if (
        result.success
        && tool.name === "draft_mechanism_figure"
        && isChartQaBlocked(result.data)
      ) {
        newMessages.push({
          role: "user",
          content: buildMechanismQaBlockNudge(extractChartQaFindingCodes(result.data)),
        });
        newSummaries.push("[figure-loop] 机理图 qaReport=block：按 findings 改 Spec 重出");
      }

      // P0：QA 判定需重生成 → 硬 nudge，禁止无 replace 再出图
      if (
        result.success
        && (tool.name === "generate_table"
          || tool.name === "generate_chart"
          || tool.name === "plot_peak_stack" || tool.name === "plot_panel_grid" || tool.name === "plot_curve_overlay"
          || tool.name === "draft_mechanism_figure"
          || tool.name === "generate_xrd_analysis"
          || (tool.name === "illustrate_mechanism_figure"
            && (result.data as { action?: unknown })?.action === "adopt"))
        && !isChartQaBlocked(result.data)
        && !assetLandedInBody(result.data)
      ) {
        newMessages.push({
          role: "user",
          content:
            `System: ${tool.name} 已生成但正文里没有这张表/图。`
            + "禁止向用户汇报「已经插好」。立刻用同一内容再调用并传 sectionKey（results 或 methods），然后 read_section 回看落点。",
        });
        newSummaries.push(`[insert-verify] ${tool.name} 未进正文，禁止收尾`);
      } else if (
        result.success
        && (tool.name === "generate_table"
          || tool.name === "generate_chart"
          || tool.name === "plot_peak_stack" || tool.name === "plot_panel_grid" || tool.name === "plot_curve_overlay"
          || tool.name === "draft_mechanism_figure")
        && assetLandedInBody(result.data)
        && (result.data as { verifiedInBody?: unknown }).verifiedInBody === false
      ) {
        newMessages.push({
          role: "user",
          content:
            "System: 声称已插入但回看未在正文找到标记。请 read_section 核对该节末尾；未找到则带 replaceImageUrl/sectionKey 重插。不要开始下一节。",
        });
        newSummaries.push("[insert-verify] 回看失败，须 read_section");
      } else if (
        result.success
        && tool.name === "illustrate_mechanism_figure"
        && (result.data as { action?: unknown })?.action === "generate"
      ) {
        newMessages.push({
          role: "user",
          content:
            "System: 即梦/智谱示意候选已出，禁止自动插入正文。"
            + "向用户展示候选，等他们说采用哪张后再 illustrate_mechanism_figure action=adopt。",
        });
        newSummaries.push("[illustrate] 候选待人选，禁止自动插入");
      }

      // P0：QA 判定需重生成 → 硬 nudge，禁止无 replace 再出图
      if (result.success && tool.name === "read_figure" && isFigureQaNeedsRegen(result)) {
        const failUrl =
          extractFigureImageUrl(result)
          || String((result.data as { imageUrl?: unknown })?.imageUrl ?? "");
        newMessages.push({
          role: "user",
          content:
            "System: 识图质检未通过（需重生成）。"
            + (failUrl
              ? `下一轮 draft_mechanism_figure / generate_chart / plot_peak_stack / plot_panel_grid / plot_curve_overlay 必须带 replaceImageUrl="${failUrl}" 就地替换；`
              : "下一轮出图必须带 replaceImageUrl；")
            + "禁止同标题再 append。也可先 remove_figure。期刊观感请引导用户到 /plot 精修。",
        });
        newSummaries.push("[figure-loop] QA 未通过：下一轮必须 replaceImageUrl");
      } else if (
        result.success
        && tool.name === "read_figure"
        && isFigureQaNeedsPolish(result)
      ) {
        const polishUrl =
          extractFigureImageUrl(result)
          || String((result.data as { imageUrl?: unknown })?.imageUrl ?? "");
        newMessages.push({
          role: "user",
          content: buildFigureQaPolishNudge(polishUrl || undefined),
        });
        newSummaries.push("[figure-loop] QA 可接受·建议精修（不强制重画）");
      }

      const illInject = shouldInjectIllustrationAfterQa({
        result,
        goal: state.goal,
        messages: [...state.messages, ...newMessages],
        observations: [...state.observations, ...newObservations],
        queued: toolQueue.slice(tcIdx + 1),
      });
      if (tool.name === "read_figure" && illInject) {
        toolQueue.splice(tcIdx + 1, 0, buildIllustrateGenerateCall(illInject.imageUrl));
        newMessages.push({
          role: "user",
          content:
            `System: 结构已过线且用户要求文生图。立刻 illustrate_mechanism_figure action=generate，sourceImageUrl="${illInject.imageUrl}"。`
            + "禁止只让用户去 /plot，禁止自动 adopt。",
        });
        newSummaries.push(`[illustrate] 结构过线，排队即梦观感候选 → ${illInject.imageUrl}`);
      }

      // 后置门禁链（antispam 停滞 / clarify / outline 检查点）：
      // break → 记 observation 停本轮；checkpoint → 暂停等用户（outline 时同步 plan 焦点）
      const postVerdict = evaluatePostGates({
        tool,
        result,
        state,
        agentContext,
        antispamTracker,
      });
      if (!postVerdict.ok) {
        if (postVerdict.kind === "break") {
          newSummaries.push(`[antispam] ${postVerdict.warning}`);
          newMessages.push({
            role: "user",
            content: `Tool result (antispam):\n${postVerdict.warning}`,
          });
          events.push({
            type: "agent/observation",
            tool: tool.name,
            result: { success: false, error: postVerdict.warning },
            error: postVerdict.warning,
          });
          trace("antispam", false, { reason: postVerdict.warning, via: "post-gate" });
          // 停滞熔断多次仍无进展 → 硬停机，不再放行后续工具
          if (antispamTracker.breakCount >= MAX_BREAKS_BEFORE_HARD_STOP) {
            const hardMsg =
              `已连续 ${antispamTracker.breakCount} 次触发空转熔断，本轮强制结束：`
              + "请基于已有信息向用户总结当前进展并询问下一步，不要再调用工具。";
            error = hardMsg;
            events.push({ type: "agent/error", error: hardMsg });
            trace("antispam", false, { reason: hardMsg, via: "post-gate" });
            finished = true;
            break;
          }
          break;
        }
        // checkpoint（clarify / outline 批准）
        const checkpoint = postVerdict.checkpoint;
        events.push({ type: "agent/checkpoint", checkpoint });
        events.push({ type: "agent/status", status: "awaiting_checkpoint" });
        if (postVerdict.updateFocus && plan) {
          const focus = getFocusSubtask(plan);
          plan = { ...plan, focusSubtaskId: focus?.id ?? null };
          events.push({ type: "agent/plan", plan });
        }
        return {
          // 当前工具已执行完并触发检查点；保留后续同批调用，批准后继续
          pendingToolCalls: toolQueue.slice(tcIdx + 1),
          toolCallCount,
          toolSummaries: newSummaries,
          observations: newObservations,
          messages: newMessages,
          events,
          plan,
          toolTrace: newTrace,
          ...(reflectReset ? { reflectCount: 0 } : {}),
          awaitingCheckpoint: checkpoint,
          finished: true,
          ...((checkpoint.kind === "outline_approve" || checkpoint.kind === "blueprint_approve")
            ? {
                approvedCheckpointKinds: revokeApprovedKind(
                  state.approvedCheckpointKinds ?? [],
                  checkpoint.kind,
                ),
              }
            : {}),
        };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      trace(tool.name, false, { reason: errMsg, via: "throw" });
      newSummaries.push(`[${tool.name}] 失败: ${errMsg}`);
      newMessages.push({ role: "user", content: `Tool result (${tool.name}):\n${errMsg}` });
      events.push({ type: "agent/observation", tool: tool.name, error: errMsg });
      newObservations.push({ tool: tool.name, success: false, error: errMsg });
      plan = advancePlanAfterTool(plan, tool.name, false);
    }
  }

  if (plan) {
    const focus = getFocusSubtask(plan);
    plan = { ...plan, focusSubtaskId: focus?.id ?? null };
    events.push({ type: "agent/plan", plan });
  }

  return {
    pendingToolCalls: [],
    toolCallCount,
    toolSummaries: newSummaries,
    observations: newObservations,
    messages: newMessages,
    events,
    error,
    toolTrace: newTrace,
    ...(reflectReset ? { reflectCount: 0 } : {}),
    finished: finished || undefined,
    plan,
    grantedConfirm,
  };
}

/** 反思节点：写完章节未自查时轻推验证/修正，再回 agent；否则放行收尾 */
export async function reflectNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  const { agentContext } = getAgentGraphRuntime(config.configurable);
  const events: AgentSSEEvent[] = [];

  if (agentContext.signal.aborted) {
    return {
      finished: true,
      events: [{ type: "agent/status", status: "cancelled" }],
    };
  }

  const analysis = analyzeReflection(state.observations);
  if (!analysis.nudge || state.reflectCount >= MAX_REFLECT_ROUNDS) {
    return { finished: true, events };
  }

  events.push({ type: "agent/status", status: "thinking" });
  return {
    finished: false,
    reflectCount: state.reflectCount + 1,
    messages: [{ role: "user", content: analysis.nudge }],
    events,
  };
}

export async function finalizeNode(
  state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
  if (state.events.some((e) => e.type === "agent/status" && e.status === "cancelled")) {
    return { finished: true };
  }

  if (state.error && state.events.some((e) => e.type === "agent/error")) {
    return { finished: true };
  }

  if (state.awaitingConfirm) {
    return {
      finished: true,
      events: [
        { type: "agent/status", status: "awaiting_checkpoint" },
      ],
    };
  }

  if (state.awaitingCheckpoint) {
    const cp = state.awaitingCheckpoint;
    return {
      finished: true,
      events: [
        {
          type: "agent/thought",
          content: `已暂停：${cp.title}。请在面板中批准或提出修改意见后继续。`,
        },
        { type: "agent/status", status: "awaiting_checkpoint" },
      ],
    };
  }

  const announced = thoughtAnnouncesUnfinishedTool(
    state.finalThought,
    state.observations,
  );
  const turnSummaryCount = Math.max(0, state.toolCallCount);
  const turnSummaries =
    turnSummaryCount > 0
      ? state.toolSummaries.slice(-turnSummaryCount)
      : [];
  const parts = [
    state.finalThought?.trim(),
    turnSummaries.length > 0
      ? `执行摘要:\n${turnSummaries.join("\n")}`
      : null,
    announced
      ? `——\n刚才只是口头说了要「${announced.label}」，还没有真正执行。请直接说「继续」或点下方快捷按钮。`
      : null,
  ].filter(Boolean);

  const events: AgentSSEEvent[] = [
    { type: "agent/status", status: "finalizing" },
    {
      type: "agent/complete",
      summary: {
        text: parts.join("\n\n") || "任务已完成。",
        toolCallCount: turnSummaries.length,
        keyFindings: [],
      },
    },
    { type: "agent/status", status: "completed" },
  ];

  return { events, finished: true };
}

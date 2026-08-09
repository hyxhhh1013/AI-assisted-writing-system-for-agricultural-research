import type { AgentCheckpointRequest, AgentSSEEvent } from "@/contracts/agent";
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
  buildContinueNudge,
  getFocusSubtask,
  markFocusRunning,
  planHasPendingWork,
} from "@/lib/agent/core/plan-progress";
import {
  buildBlueprintCheckpoint,
  buildClarifyCheckpoint,
  buildConfigCheckpoint,
  buildOutlineCheckpoint,
  shouldPauseForBlueprintApprove,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
} from "@/lib/agent/core/checkpoints";
import { buildFigureQaPolishNudge } from "@/lib/agent/figure-qa";
import {
  buildFigureQaContinueNudge,
  buildReadFigureQaCall,
  extractFigureImageUrl,
  FIGURE_BRIEF_QUESTION,
  FIGURE_GENERATE_TOOLS,
  isFigureQaNeedsPolish,
  isFigureQaNeedsRegen,
  lastFigureQaNeedsReplace,
  shouldPauseForFigureBrief,
} from "@/lib/agent/figure-loop";
import { buildToolConfirmMessage } from "@/lib/agent/confirm-message";
import { isConfirmGranted } from "@/lib/agent/core/confirm-grant";
import {
  ensureNextWritePrerequisite,
  isWriteToolNeedingPrereqs,
  type WritePrereqStep,
} from "@/lib/agent/core/ensure-write-prereqs";
import {
  isAcademicPaperPipelineGoal,
  isCitationApplyGoal,
  isCitationCheckGoal,
  isSectionDraftGoal,
  parseLiteratureImportTarget,
  pickIntentNudge,
  pickIntentStopAsk,
  shouldSkipPlanner,
  sumImportedCount,
  type IntentClosureContext,
} from "@/lib/agent/core/goal-intents";
import { buildImportReferenceConfirmParams } from "@/lib/agent/import-confirm";
import { analyzeReflection, MAX_REFLECT_ROUNDS } from "@/lib/agent/core/reflect";
import { compactAgentMessages } from "@/lib/agent/core/context-compact";
import { MAX_INTENT_CONTINUES } from "@/lib/agent/langgraph/state";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import {
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
import { isProjectMutatingTool } from "@/lib/agent/project-mutated";
import type { ParsedToolCall, ToolObservation } from "@/lib/agent/types";
import { getAgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import {
  shouldContinuePlanWork,
  type AgentGraphStateType,
} from "@/lib/agent/langgraph/state";
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
    if (shouldSkipPlanner(state.goal, state.observations ?? [])) {
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

  const plan = state.plan ? markFocusRunning(state.plan) : null;
  // 不每轮注入【计划焦点】假 user；改为提前结束时用 buildContinueNudge 轻推（见下方 canContinue）
  const extraMessages: AgentGraphStateType["messages"] = [];

  const systemPrompt = buildAgentSystemPrompt(tools);
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
          tools: toolsToOpenAISchema(tools),
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
          tools: toolsToOpenAISchema(tools),
          signal: agentContext.signal,
          userId: agentContext.userId,
          temperature: 0.3,
        });
      }
    } catch {
      response = await callAINonStreamingWithTools({
        messages: llmMessages,
        tools: toolsToOpenAISchema(tools),
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
    };
  }

  const updates: Partial<AgentGraphStateType> = {
    iteration: nextIteration,
    events,
    messages: extraMessages,
    plan: plan
      ? { ...plan, focusSubtaskId: getFocusSubtask(plan)?.id ?? null }
      : state.plan,
  };

  if (response.content) {
    updates.finalThought = response.content;
    updates.messages = [...extraMessages, { role: "assistant", content: response.content }];
    events.push({ type: "agent/thought", content: response.content });
  }

  if (response.finishReason === "stop" || response.toolCalls.length === 0) {
    // 与 routeAfterAgent 共用同一续跑判断（参数传「更新后」的值，见 shouldContinuePlanWork 文档）
    const canContinue = shouldContinuePlanWork({
      plan,
      iteration: nextIteration,
      planContinueCount: state.planContinueCount + 1,
      toolSummaries: state.toolSummaries,
      maxIterations: agentContext.budget.maxIterations,
    });

    updates.pendingToolCalls = [];

    const observations = state.observations;
    const searchedOk = observations.some(
      (o) =>
        (o.tool === "search_external" || o.tool === "search_knowledge")
        && o.success,
    );
    const importCount = sumImportedCount(observations);
    const importTarget = parseLiteratureImportTarget(state.goal);
    const refTotal = agentContext.projectSnapshot?.references?.length ?? 0;
    const wroteOk = observations.some(
      (o) =>
        o.tool === "write_section"
        && o.success
        && o.data != null
        && (o.data as { persisted?: unknown }).persisted != null,
    );

    // 意图收尾续跑 / 停下问用户：由 goal-intents 的意图表统一驱动（见 pickIntentNudge / pickIntentStopAsk）
    const intentCtx: IntentClosureContext = {
      goal: state.goal,
      observations,
      searchedOk,
      importCount,
      importTarget,
      refTotal,
      wroteOk,
    };

    const canIntentContinue = state.planContinueCount < MAX_INTENT_CONTINUES;
    const intentNudge = !canIntentContinue ? null : pickIntentNudge(intentCtx);
    // QA 未通过：优先于计划续跑/收尾，强制再跑一轮工具（避免长篇推演后 finished）
    const figureQaPending = lastFigureQaNeedsReplace(observations);
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
      updates.finished = true;
      // 对话式收尾：意图未完成 → 问用户；有未完成计划 → 提醒可继续（引用修正跟聊不提示旧 plan）
      let hint = pickIntentStopAsk(intentCtx);
      const suppressPlanHint =
        isAcademicPaperPipelineGoal(state.goal)
        || isCitationApplyGoal(state.goal, observations)
        || isCitationCheckGoal(state.goal);
      if (!hint && !suppressPlanHint && planHasPendingWork(plan) && plan) {
        const left = plan.subtasks
          .filter((s) => s.status === "pending" || s.status === "running")
          .map((s) => s.title);
        hint =
          `\n\n——\n还有未完成步骤：${left.join("；")}。你可以直接说「继续」或指定下一步（例如「先写引言」）。`;
      }
      // 收尾兜底：执行型指令（用户要实际改动）但整轮无落地写操作 → 引导 Agent 用 ask_user 确认，
      // 避免「分析完就当完成」——这是 ask_user 澄清链路的关键触发点
      const execWords =
        /(改|修|调整|优化|更新|修正|refine|执行|按方案|补|删|插入|替换|生成|重写|重画|润色|扩展|处理|弄|配图)/i;
      const landedWrite = observations.some(
        (o) => o.success
          && (o.tool === "write_section" || o.tool === "refine_content"
            || o.tool === "update_paper_config" || o.tool === "generate_outline"
            || o.tool === "write_bilingual_abstract" || o.tool === "import_reference"
            || o.tool === "generate_chart" || o.tool === "draft_mechanism_figure"
            || o.tool === "apply_revision_item"
            || o.tool === "generate_writing_blueprint"),
      );
      if (
        !hint
        && (execWords.test(state.goal) || isSectionDraftGoal(state.goal, observations))
        && observations.length > 0
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
    return updates;
  }

  updates.pendingToolCalls = response.toolCalls;
  updates.planContinueCount = 0; // 有工具进展则重置续跑计数
  // reflectCount 不在此重置：仅在 write_section 成功时于 toolsNode 重置，避免「验证→修正→再验证」无限循环
  if (updates.plan) {
    events.push({ type: "agent/plan", plan: updates.plan });
  }
  return updates;
}

/**
 * 自动补齐的前置 step 是否命中批准检查点（ap-full 目标 + outline/blueprint 未批准）。
 * 返回检查点请求；未命中返回 null。preview 从 step.result.data.preview 或 summary 构建。
 */
export function buildPrereqCheckpoint(
  state: AgentGraphStateType,
  step: { tool: WritePrereqStep; result: { success: boolean; data?: unknown; summary?: string; error?: string } },
): AgentCheckpointRequest | null {
  if (!step.result.success) return null;
  const approvedKinds = state.approvedCheckpointKinds ?? [];
  const data = step.result.data as { preview?: unknown } | null | undefined;
  const preview =
    typeof data?.preview === "string" && data.preview
      ? data.preview
      : step.result.summary ?? "";
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
  /** 本轮是否有 write_section 成功写回：新写入需重新给反思预算 */
  let reflectReset = false;
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let finished = false;
  let plan = state.plan;
  let grantedConfirm = state.grantedConfirm ?? null;

  /** 门禁失败统一记录：摘要 + LLM 消息 + SSE observation + 计划标记失败 */
  const rejectGate = (toolName: string, error: string) => {
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
      finished = true;
      break;
    }

    const tool = findTool(tools, toolCall.name);
    if (!tool) {
      const msg = `未知工具: ${toolCall.name}`;
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
        awaitingCheckpoint: checkpoint,
        finished: true,
      };
    }

    // 前置门禁链（重复 / 检索配额 / 意图+先读后写）：
    // soft → 记 observation 继续下一个工具；reject → 记失败继续；hard → agent/error 停本轮
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
        error = gateVerdict.error;
        events.push({ type: "agent/error", error });
        finished = true;
        break;
      }
      if (gateVerdict.kind === "soft") {
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

    // 写节前自动补大纲/蓝图，避免 LLM 多轮「被拒 → 再调 generate_*」。
    // ap-full 目标（写整篇）逐步补齐 + 逐步批准：每补一个 outline/blueprint 暂停让用户确认；
    // 普通目标一次补完（ensureNextWritePrerequisite 循环直至前置齐）。
    if (isWriteToolNeedingPrereqs(tool.name)) {
      // 逐步补齐；每步生成后若命中批准检查点则暂停，resume 后继续补下一个 / 执行写工具
      const prereqRan: string[] = [];
      let prereqErr: string | null = null;
      let prereqPaused = false;

      while (!prereqPaused) {
        const ensured = await ensureNextWritePrerequisite(
          agentContext,
          tools,
          () => {
            markAgentProjectDirty(agentContext);
            return refreshAgentProjectContext(agentContext);
          },
        );
        toolCallCount = agentContext.budget.toolCallCount;

        for (const step of ensured.steps) {
          events.push({
            type: "agent/action",
            tool: step.tool,
            params: { persistToProject: true, autoPrereq: true },
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
              awaitingCheckpoint: cp,
              finished: true,
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

    try {
      const result = await tool.execute(params, agentContext);
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

      // P0：出图成功后硬注入 read_figure(mode=qa)，不依赖模型自觉
      if (result.success && FIGURE_GENERATE_TOOLS.has(tool.name)) {
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
                `System: 刚生成的图已自动排队识图质检 read_figure(mode=qa, imageUrl=${imageUrl})。`
                + "若 QA 判定需重生成，下一轮必须带 replaceImageUrl 重画，禁止同标题无 replace 再 append。",
            });
          }
        }
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
              ? `下一轮 draft_mechanism_figure / generate_chart 必须带 replaceImageUrl="${failUrl}" 就地替换；`
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
          // 停滞熔断多次仍无进展 → 硬停机，不再放行后续工具
          if (antispamTracker.breakCount >= MAX_BREAKS_BEFORE_HARD_STOP) {
            const hardMsg =
              `已连续 ${antispamTracker.breakCount} 次触发空转熔断，本轮强制结束：`
              + "请基于已有信息向用户总结当前进展并询问下一步，不要再调用工具。";
            error = hardMsg;
            events.push({ type: "agent/error", error: hardMsg });
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
          ...(reflectReset ? { reflectCount: 0 } : {}),
          awaitingCheckpoint: checkpoint,
          finished: true,
        };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
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

  const parts = [
    state.finalThought?.trim(),
    state.toolSummaries.length > 0
      ? `执行摘要:\n${state.toolSummaries.join("\n")}`
      : null,
  ].filter(Boolean);

  const events: AgentSSEEvent[] = [
    { type: "agent/status", status: "finalizing" },
    {
      type: "agent/complete",
      summary: {
        text: parts.join("\n\n") || "任务已完成。",
        toolCallCount: state.toolSummaries.length,
        keyFindings: [],
      },
    },
    { type: "agent/status", status: "completed" },
  ];

  return { events, finished: true };
}

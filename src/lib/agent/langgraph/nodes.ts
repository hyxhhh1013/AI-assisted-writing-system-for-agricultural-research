import type { AgentSSEEvent } from "@/contracts/agent";
import { buildAgentSystemPrompt } from "@/lib/agent/core/prompts";
import { createPlan } from "@/lib/agent/core/planner";
import { callAINonStreamingWithTools } from "@/lib/agent/core/llm-tools";
import {
  checkSearchQuota,
  noteSearchCall,
  noteToolProgress,
} from "@/lib/agent/core/antispam";
import {
  checkRepeatCall,
  shouldRequestConfirmation,
} from "@/lib/agent/core/safety";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import { checkReadBeforeWrite } from "@/lib/agent/core/read-before-write";
import {
  findTool,
  parseToolArgs,
  toolsToOpenAISchema,
} from "@/lib/agent/core/tool-registry";
import {
  advancePlanAfterTool,
  buildContinueNudge,
  buildFocusNudge,
  getFocusSubtask,
  markFocusRunning,
  planHasPendingWork,
} from "@/lib/agent/core/plan-progress";
import {
  buildConfigCheckpoint,
  buildOutlineCheckpoint,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
} from "@/lib/agent/core/checkpoints";
import { buildToolConfirmMessage } from "@/lib/agent/confirm-message";
import { isConfirmGranted } from "@/lib/agent/core/confirm-grant";
import {
  ensureWritePrerequisites,
  isWriteToolNeedingPrereqs,
} from "@/lib/agent/core/ensure-write-prereqs";
import {
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  isLiteratureHuntGoal,
  isReviewWritingGoal,
  isSectionDraftGoal,
  parseLiteratureImportTarget,
  reviewRefsShortageNudge,
} from "@/lib/agent/core/goal-intents";
import { enrichImportReferenceParams } from "@/lib/agent/literature-relevance";
import { MAX_INTENT_CONTINUES } from "@/lib/agent/langgraph/state";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import { loadAgentProject } from "@/lib/agent/project-loader";
import {
  appendPhasePackToBriefing,
} from "@/lib/agent/phase-task-pack";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";

/** 从工具摘要统计已成功导入篇数（含批量） */
function countImportedRefsFromSummaries(lines: readonly string[]): number {
  let n = 0;
  for (const l of lines) {
    if (!l.includes("[import_reference]")) continue;
    const batch = l.match(/已批量导入\s*(\d+)\s*篇/);
    if (batch) {
      n += Number(batch[1]);
      continue;
    }
    if (/已导入参考文献|已导入/.test(l) && !/失败|待确认/.test(l)) {
      n += 1;
    }
  }
  return n;
}
import {
  appendMemoryToBriefing,
  buildRecentAgentMemoryBlock,
} from "@/lib/agent/session-memory";
import { getAgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import {
  MAX_PLAN_CONTINUES,
  type AgentGraphStateType,
} from "@/lib/agent/langgraph/state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const SNAPSHOT_REFRESH_TOOLS = new Set([
  "generate_outline",
  "generate_writing_blueprint",
  "build_argument_blueprint",
  "write_section",
  "refine_content",
  "write_bilingual_abstract",
  "import_reference",
  "validate_citations",
  "run_review_rounds",
  "generate_chart",
  "generate_xrd_analysis",
  "update_paper_config",
  "apply_revision_item",
]);

async function refreshAgentProjectContext(
  agentContext: import("@/lib/agent/types").AgentContext,
): Promise<void> {
  if (!agentContext.projectId) return;
  try {
    const snap = await loadAgentProject(agentContext.userId, agentContext.projectId);
    agentContext.projectSnapshot = snap;
    let briefing = appendPhasePackToBriefing(
      formatAgentProjectBriefing(snap),
      snap,
    );
    try {
      const memory = await buildRecentAgentMemoryBlock(
        agentContext.userId,
        agentContext.projectId,
      );
      briefing = appendMemoryToBriefing(briefing, memory);
    } catch {
      /* ignore */
    }
    agentContext.projectBriefing = briefing;
  } catch {
    /* 刷新失败不阻断 */
  }
}

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

    const rawPlan = await createPlan(state.goal, agentContext, agentContext.projectBriefing);
    const plan = markFocusRunning(rawPlan);
    const focus = getFocusSubtask(plan);
    events.push({ type: "agent/plan", plan });
    const focusHint = buildFocusNudge(plan);
    return {
      plan: { ...plan, focusSubtaskId: focus?.id ?? null },
      events,
      messages: [
        {
          role: "assistant",
          content: `Plan:\n${plan.subtasks.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n")}`,
        },
        ...(focusHint
          ? [{ role: "user" as const, content: focusHint }]
          : []),
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

  const nextIteration = state.iteration + 1;
  agentContext.budget.currentIteration = nextIteration;

  if (nextIteration > agentContext.budget.maxIterations) {
    return { iteration: nextIteration, finished: true, events };
  }

  events.push({ type: "agent/status", status: "thinking" });

  const plan = state.plan ? markFocusRunning(state.plan) : null;
  const extraMessages: AgentGraphStateType["messages"] = [];
  const focusNudge = buildFocusNudge(plan);
  const lastContent = state.messages[state.messages.length - 1]?.content ?? "";
  if (focusNudge && !lastContent.includes("【计划焦点】") && !lastContent.startsWith("【系统】")) {
    extraMessages.push({ role: "user", content: focusNudge });
  }

  const systemPrompt = buildAgentSystemPrompt(tools, agentContext.projectBriefing);
  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...state.messages,
    ...extraMessages,
  ];

  let response;
  try {
    response = await callAINonStreamingWithTools({
      messages: llmMessages,
      tools: toolsToOpenAISchema(tools),
      signal: agentContext.signal,
      userId: agentContext.userId,
      temperature: 0.3,
    });
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
    const canContinue =
      planHasPendingWork(plan)
      && nextIteration < agentContext.budget.maxIterations
      && state.planContinueCount < MAX_PLAN_CONTINUES;

    updates.pendingToolCalls = [];

    const lines = state.toolSummaries;
    const searchedOk = lines.some(
      (l) =>
        (l.includes("[search_external]") || l.includes("[search_knowledge]"))
        && !l.includes("失败"),
    );
    const importCount = countImportedRefsFromSummaries(lines);
    const importTarget = parseLiteratureImportTarget(state.goal);
    const refTotal = agentContext.projectSnapshot?.references?.length ?? 0;
    const importedOk = refTotal >= importTarget || importCount >= importTarget;
    const wroteOk = lines.some(
      (l) =>
        l.includes("[write_section]")
        && (l.includes("已写回") || l.includes("已生成并写回")),
    );
    const reviewShort =
      isReviewWritingGoal(state.goal)
        ? reviewRefsShortageNudge(refTotal, importTarget)
        : null;
    const intentNudge =
      (isLiteratureHuntGoal(state.goal) || Boolean(reviewShort))
      && !importedOk
      && state.planContinueCount < MAX_INTENT_CONTINUES
        ? importCount === 0 && refTotal < importTarget && searchedOk
          ? `【系统】已检索但项目文献仍不足（现有 ${refTotal} 篇，目标约 ${importTarget} 篇）。`
            + `请立刻批量 import_reference(hitsJson=suggestedHitsJson, query, why≥8字)；不够则换 query 再搜再导。`
          : !searchedOk && refTotal < importTarget
            ? `【系统】写综述/备文献需要约 ${importTarget} 篇，当前仅 ${refTotal} 篇。`
              + "请先 search_knowledge / search_external（多换同义英文 query），再分批 import_reference。"
            : `【系统】已有/本轮导入合计仍不足：项目 ${refTotal} 篇，本轮导入约 ${importCount} 篇，目标约 ${importTarget} 篇。`
              + "请继续 search + import_reference(hitsJson=...) 补足。"
        : isSectionDraftGoal(state.goal)
            && !isReviewWritingGoal(state.goal)
            && !wroteOk
            && state.planContinueCount < MAX_INTENT_CONTINUES
          ? "【系统】用户要写章节，但尚未成功 write_section 写回。"
            + "请先读大纲/文献（或 inspect），再直接 write_section（蓝图可自动补）；不要只提问。"
          : isReviewWritingGoal(state.goal)
              && importedOk
              && !wroteOk
              && state.planContinueCount < MAX_INTENT_CONTINUES
            ? "【系统】文献体量已够，请 list_references 核对后 write_section(literature_body) 写回综述正文。"
            : null;

    if (canContinue && plan) {
      updates.finished = false;
      updates.planContinueCount = state.planContinueCount + 1;
      updates.messages = [
        ...(updates.messages ?? extraMessages),
        { role: "user", content: buildContinueNudge(plan) },
      ];
      events.push({ type: "agent/plan", plan: updates.plan! });
    } else if (intentNudge) {
      updates.finished = false;
      updates.planContinueCount = state.planContinueCount + 1;
      updates.messages = [
        ...(updates.messages ?? extraMessages),
        { role: "user", content: intentNudge },
      ];
    } else {
      updates.finished = true;
      // 对话式收尾：有未完成计划时提醒用户，不强制续跑
      if (planHasPendingWork(plan) && plan) {
        const left = plan.subtasks
          .filter((s) => s.status === "pending" || s.status === "running")
          .map((s) => s.title);
        const hint =
          `\n\n——\n还有未完成步骤：${left.join("；")}。你可以直接说「继续」或指定下一步（例如「先写引言」）。`;
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
  if (updates.plan) {
    events.push({ type: "agent/plan", plan: updates.plan });
  }
  return updates;
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
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "executing" }];
  const newMessages: AgentGraphStateType["messages"] = [];
  const newSummaries: string[] = [];
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let finished = false;
  let plan = state.plan;
  let grantedConfirm = state.grantedConfirm ?? null;

  for (const toolCall of state.pendingToolCalls) {
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
      continue;
    }

    let params = parseToolArgs(toolCall.args);
    const repeat = checkRepeatCall(repeatTracker, tool.name, params);
    if (!repeat.allowed) {
      const soft =
        tool.name === "read_section"
        || tool.name === "search_knowledge"
        || tool.name === "search_external"
          ? (repeat.warning ?? "请停止重复调用，改换策略或直接回复用户")
          : null;
      if (soft) {
        newSummaries.push(`[${tool.name}] ${soft}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${soft}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: soft },
          error: soft,
        });
        continue;
      }
      error = repeat.warning ?? "重复调用";
      events.push({ type: "agent/error", error });
      finished = true;
      break;
    }

    const searchQuota = checkSearchQuota(antispamTracker, tool.name);
    if (!searchQuota.allowed) {
      const soft = searchQuota.warning ?? "检索次数已达上限";
      newSummaries.push(`[${tool.name}] ${soft}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${soft}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: soft },
        error: soft,
      });
      continue;
    }

    // agent/action 在门禁全部通过后再发，避免被拒的 search/写节污染时间线
    const recentLines = [...state.toolSummaries, ...newSummaries];
    const diagnoseGate = checkDiagnoseInspectGate(
      state.goal,
      tool.name,
      recentLines,
    );
    if (!diagnoseGate.ok) {
      newSummaries.push(`[${tool.name}] 失败: ${diagnoseGate.error}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${diagnoseGate.error}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: diagnoseGate.error },
        error: diagnoseGate.error,
      });
      plan = advancePlanAfterTool(plan, tool.name, false);
      continue;
    }

    const draftSearchGate = checkDraftSearchGate(
      state.goal,
      tool.name,
      recentLines,
    );
    if (!draftSearchGate.ok) {
      newSummaries.push(`[${tool.name}] 失败: ${draftSearchGate.error}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${draftSearchGate.error}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: draftSearchGate.error },
        error: draftSearchGate.error,
      });
      plan = advancePlanAfterTool(plan, tool.name, false);
      continue;
    }

    // 先读后写：须在自动补蓝图之前，避免未读上下文就烧 LLM 生成蓝图
    const readGate = checkReadBeforeWrite(tool.name, params, recentLines);
    if (!readGate.ok) {
      newSummaries.push(`[${tool.name}] 失败: ${readGate.error}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${readGate.error}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: readGate.error },
        error: readGate.error,
      });
      plan = advancePlanAfterTool(plan, tool.name, false);
      continue;
    }

    // 写节前自动补大纲/蓝图，避免 LLM 多轮「被拒 → 再调 generate_*」
    if (isWriteToolNeedingPrereqs(tool.name)) {
      const ensured = await ensureWritePrerequisites(
        agentContext,
        tools,
        () => refreshAgentProjectContext(agentContext),
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
        plan = advancePlanAfterTool(plan, step.tool, step.result.success);
        noteToolProgress(
          antispamTracker,
          step.tool,
          agentContext.projectSnapshot,
          step.result.success,
        );
      }
      if (!ensured.ok) {
        const err =
          ensured.error
          ?? "自动补齐写作前置失败，请先生成大纲与蓝图";
        newSummaries.push(`[${tool.name}] 失败: ${err}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${err}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: err },
          error: err,
        });
        plan = advancePlanAfterTool(plan, tool.name, false);
        continue;
      }
      if (ensured.ran.length > 0) {
        newMessages.push({
          role: "user",
          content:
            `【系统】已自动补齐写作前置（${ensured.ran.join(" → ")}），继续执行 ${tool.name}。`,
        });
      }
    }

    const gate = checkAgentToolPhaseGate(
      tool.name,
      params,
      agentContext.projectSnapshot,
    );
    if (!gate.ok) {
      newSummaries.push(`[${tool.name}] 失败: ${gate.error}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${gate.error}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: gate.error },
        error: gate.error,
      });
      plan = advancePlanAfterTool(plan, tool.name, false);
      continue;
    }

    events.push({ type: "agent/action", tool: tool.name, params });

    // 忽略模型自带的 userConfirmed；仅服务端 grantedConfirm 可放行
    if (shouldRequestConfirmation(tool)) {
      const granted = isConfirmGranted(grantedConfirm, tool.name, params);
      if (!granted) {
        const confirmParams =
          tool.name === "import_reference"
            ? enrichImportReferenceParams(params)
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
          pendingToolCalls: [],
          toolCallCount,
          toolSummaries: newSummaries,
          messages: newMessages,
          events,
          plan,
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
      plan = advancePlanAfterTool(plan, tool.name, result.success);
      if (result.success && SNAPSHOT_REFRESH_TOOLS.has(tool.name)) {
        await refreshAgentProjectContext(agentContext);
      }

      const progress = noteToolProgress(
        antispamTracker,
        tool.name,
        agentContext.projectSnapshot,
        result.success,
      );
      if (progress.stagnant && progress.warning) {
        newSummaries.push(`[antispam] ${progress.warning}`);
        newMessages.push({
          role: "user",
          content: `Tool result (antispam):\n${progress.warning}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: progress.warning },
          error: progress.warning,
        });
        break;
      }

      if (
        shouldPauseForOutlineApprove({
          goal: state.goal,
          toolName: tool.name,
          toolSuccess: result.success,
          persisted: Boolean(
            result.data
            && typeof result.data === "object"
            && (result.data as { persisted?: unknown }).persisted !== false,
          ),
          approvedKinds: state.approvedCheckpointKinds ?? [],
        })
      ) {
        const preview =
          typeof result.data === "object"
          && result.data
          && "preview" in result.data
            ? String((result.data as { preview?: unknown }).preview ?? "")
            : result.summary ?? "";
        const checkpoint = buildOutlineCheckpoint(preview);
        events.push({ type: "agent/checkpoint", checkpoint });
        events.push({ type: "agent/status", status: "awaiting_checkpoint" });
        if (plan) {
          const focus = getFocusSubtask(plan);
          plan = { ...plan, focusSubtaskId: focus?.id ?? null };
          events.push({ type: "agent/plan", plan });
        }
        return {
          pendingToolCalls: [],
          toolCallCount,
          toolSummaries: newSummaries,
          messages: newMessages,
          events,
          plan,
          awaitingCheckpoint: checkpoint,
          finished: true,
        };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      newSummaries.push(`[${tool.name}] 失败: ${errMsg}`);
      newMessages.push({ role: "user", content: `Tool result (${tool.name}):\n${errMsg}` });
      events.push({ type: "agent/observation", tool: tool.name, error: errMsg });
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
    messages: newMessages,
    events,
    error,
    finished: finished || undefined,
    plan,
    grantedConfirm,
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

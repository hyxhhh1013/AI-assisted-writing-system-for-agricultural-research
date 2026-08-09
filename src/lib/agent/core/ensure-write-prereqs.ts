/**
 * 写节前置自补：缺大纲/写作蓝图/论证蓝图时由服务端按序生成，缩短「拒写→再调工具」空转。
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import type { AgentContext, AgentToolResult, ToolDefinition } from "@/lib/agent/types";

export type WritePrereqStep =
  | "generate_outline"
  | "generate_writing_blueprint";

/** 有结构即可；短中文大纲常见 20～40 字 */
const MIN_OUTLINE_CHARS = 20;

const WRITE_TOOLS = new Set(["write_section", "refine_content"]);

export function isWriteToolNeedingPrereqs(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

/** 按依赖顺序返回仍缺的前置工具名（论证已并入写作蓝图，不再要求 build_argument_blueprint） */
export function listMissingWritePrereqs(
  project: AgentProjectSnapshot | null | undefined,
): WritePrereqStep[] {
  if (!project) return [];
  const missing: WritePrereqStep[] = [];
  if (project.outline.trim().length < MIN_OUTLINE_CHARS) {
    missing.push("generate_outline");
  }
  if (!project.hasWritingBlueprint) {
    missing.push("generate_writing_blueprint");
  }
  return missing;
}

export interface EnsureWritePrereqsResult {
  ok: boolean;
  ran: WritePrereqStep[];
  error?: string;
  /** 每步执行结果，供 SSE 透出 */
  steps: Array<{
    tool: WritePrereqStep;
    result: AgentToolResult;
  }>;
}

function findTool(
  tools: ToolDefinition[],
  name: string,
): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * 在 write_section / refine_content 前补齐**第一个**缺失前置；已齐则 no-op。
 * 一次只补一个，便于调用方在每步之间插入批准检查点（ap-full 目标须逐步确认大纲/蓝图）。
 * @param refresh 每步成功后刷新 projectSnapshot（由调用方注入，避免环依赖）
 */
export async function ensureNextWritePrerequisite(
  ctx: AgentContext,
  tools: ToolDefinition[],
  refresh: () => Promise<void>,
): Promise<EnsureWritePrereqsResult> {
  const ran: WritePrereqStep[] = [];
  const steps: EnsureWritePrereqsResult["steps"] = [];

  const missing = listMissingWritePrereqs(ctx.projectSnapshot);
  if (missing.length === 0) {
    return { ok: true, ran, steps };
  }

  const next = missing[0]!;
  const tool = findTool(tools, next);
  if (!tool) {
    return {
      ok: false,
      ran,
      steps,
      error: `无法自动补齐前置：缺少工具 ${next}`,
    };
  }

  if (ctx.budget.toolCallCount >= ctx.budget.maxToolCalls) {
    return {
      ok: false,
      ran,
      steps,
      error: `自动补齐前置时工具次数已达上限（缺：${missing.join(" → ")}）`,
    };
  }

  ctx.budget.toolCallCount += 1;
  const result = await tool.execute(
    { persistToProject: true },
    ctx,
  );
  ran.push(next);
  steps.push({ tool: next, result });

  if (!result.success) {
    return {
      ok: false,
      ran,
      steps,
      error:
        result.error
        ?? `自动执行 ${next} 失败；请手动补齐后再写章节`,
    };
  }

  await refresh();
  return { ok: true, ran, steps };
}

/**
 * 在 write_section / refine_content 前补齐全部缺失前置；已齐则 no-op。
 * 保留给不需要逐步批准检查点的调用方（普通对话 / 非 ap-full 目标）。
 * @param refresh 每步成功后刷新 projectSnapshot（由调用方注入，避免环依赖）
 */
export async function ensureWritePrerequisites(
  ctx: AgentContext,
  tools: ToolDefinition[],
  refresh: () => Promise<void>,
): Promise<EnsureWritePrereqsResult> {
  const ran: WritePrereqStep[] = [];
  const steps: EnsureWritePrereqsResult["steps"] = [];

  // 最多三轮：每轮按当前快照看还缺什么（大纲生成后才允许蓝图）
  for (let round = 0; round < 3; round++) {
    const r = await ensureNextWritePrerequisite(ctx, tools, refresh);
    ran.push(...r.ran);
    steps.push(...r.steps);
    if (!r.ok) return { ...r, ran, steps };
    if (r.ran.length === 0) break;
  }

  const still = listMissingWritePrereqs(ctx.projectSnapshot);
  if (still.length > 0) {
    return {
      ok: false,
      ran,
      steps,
      error: `自动补齐后仍缺：${still.join(" → ")}`,
    };
  }
  return { ok: true, ran, steps };
}

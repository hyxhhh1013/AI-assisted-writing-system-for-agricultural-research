/**
 * 写节前置自补：缺大纲/写作蓝图/论证蓝图时由服务端按序生成，缩短「拒写→再调工具」空转。
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import type { AgentContext, AgentToolResult, ToolDefinition } from "@/lib/agent/types";
import { isOutlineReady } from "@/lib/outline-threshold";

export type WritePrereqStep =
  | "generate_outline"
  | "generate_writing_blueprint";

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
  if (!isOutlineReady(project.outline)) {
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

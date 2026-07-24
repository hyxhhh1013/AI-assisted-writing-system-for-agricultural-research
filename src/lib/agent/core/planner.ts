import type { AgentPlan } from "@/contracts/agent";
import { callAINonStreamingWithTools } from "@/lib/agent/core/llm-tools";
import type { AgentContext } from "@/lib/agent/types";

export async function createPlan(
  goal: string,
  context: AgentContext,
  projectBriefing?: string,
): Promise<AgentPlan> {
  const messages = [
    {
      role: "system" as const,
      content: `你是农业科研写作助手的任务规划器。将用户目标拆解为 2-5 个可执行子任务。
只输出 JSON，格式：{"subtasks":[{"id":"1","title":"...","status":"pending"}]}
规则：
- 结合【项目简报】与【阶段任务包】：优先完成当前阶段推荐工具，不要跳阶段硬写
- 子任务优先：检索文献 → 分析/验证 →（若用户要求写作且阶段允许）write_section 写回 → 汇总
- 用户明确要求撰写/扩写/写某章节时，必须包含写作子任务，不要省略
- 用户要「论证蓝图」时包含 build_argument_blueprint
- 用户要「双语摘要」时包含 write_bilingual_abstract
- 不要添加用户未要求且阶段不允许的写作任务`,
    },
    {
      role: "user" as const,
      content: `目标：${goal}
${context.projectId ? `项目 ID：${context.projectId}` : ""}
${context.directionSlug ? `研究方向：${context.directionSlug}` : ""}
${projectBriefing ? `\n【项目简报】\n${projectBriefing}` : ""}`,
    },
  ];

  try {
    const raw = await callAINonStreamingWithTools({
      messages,
      signal: context.signal,
      userId: context.userId,
      temperature: 0,
    });
    const parsed = parsePlanJson(raw.content ?? "");
    if (parsed.subtasks.length > 0) return parsed;
  } catch {
    /* fallback below */
  }

  return fallbackPlan(goal);
}

function fallbackPlan(goal: string): AgentPlan {
  const wantsWrite = /写|扩写|起草|生成.*(引言|方法|结果|讨论|结论|摘要|章节)/.test(goal);
  if (wantsWrite) {
    return {
      subtasks: [
        { id: "1", title: "检索与本章相关的文献要点", status: "pending" },
        { id: "2", title: "调用 write_section 生成并写回章节", status: "pending" },
        { id: "3", title: "向用户确认写回结果", status: "pending" },
      ],
    };
  }
  return {
    subtasks: [
      { id: "1", title: "理解用户目标并检索相关信息", status: "pending" },
      { id: "2", title: "执行分析或验证", status: "pending" },
      { id: "3", title: "汇总结果并回复用户", status: "pending" },
    ],
  };
}

function parsePlanJson(raw: string): AgentPlan {
  const fence = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const text = fence?.[1]?.trim() ?? raw.trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("invalid plan json");
  const obj = JSON.parse(text.slice(first, last + 1)) as {
    subtasks?: Array<{ id?: string; title?: string; status?: string }>;
  };
  const subtasks = (obj.subtasks ?? []).map((s, i) => ({
    id: s.id ?? String(i + 1),
    title: s.title ?? `子任务 ${i + 1}`,
    status: "pending" as const,
  }));
  return { subtasks };
}

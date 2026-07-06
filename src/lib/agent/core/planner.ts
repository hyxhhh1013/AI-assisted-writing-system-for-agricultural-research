import type { AgentPlan } from "@/contracts/agent";
import { callAINonStreamingWithTools } from "@/lib/agent/core/llm-tools";
import type { AgentContext } from "@/lib/agent/types";

export async function createPlan(
  goal: string,
  context: AgentContext,
): Promise<AgentPlan> {
  const messages = [
    {
      role: "system" as const,
      content: `你是农业科研写作助手的任务规划器。将用户目标拆解为 2-5 个可执行子任务。
只输出 JSON，格式：{"subtasks":[{"id":"1","title":"...","status":"pending"}]}
子任务应优先：检索文献 → 分析/验证 → 汇总交付。不要包含用户未要求的写作任务。`,
    },
    {
      role: "user" as const,
      content: `目标：${goal}
${context.projectId ? `项目 ID：${context.projectId}` : ""}
${context.directionSlug ? `研究方向：${context.directionSlug}` : ""}`,
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

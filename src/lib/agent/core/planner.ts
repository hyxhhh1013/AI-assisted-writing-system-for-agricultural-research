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
      content: `你是农业科研写作助手的任务规划器。将用户目标拆解为 2-5 个可执行子任务（偏少、可对话，不要堆成整篇流水线）。
只输出 JSON，格式：{"subtasks":[{"id":"1","title":"...","status":"pending","toolHints":["inspect_project"]}]}
规则：
- 第一步优先 inspect_project 或检索，再写
- 对齐 academic-paper 阶段思路，但只规划「本轮对话能做完」的事
- 用户明确要求撰写某章时才加 write_section；不要默认规划全文八阶段
- 缺大纲/蓝图时用 generate_* 工具名写进标题或 toolHints
- 综述/备文献：规划多轮检索 + 分批导入；综述目标约 ≥30 篇，普通检索约 15 篇
- 子任务标题写清意图，便于执行与向用户汇报`,
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
      // 规划是短任务，走便宜模型（默认 zhipu，未配置回落 deepseek）
      role: "planner",
    });
    const parsed = parsePlanJson(raw.content ?? "");
    if (parsed.subtasks.length > 0) return parsed;
  } catch {
    /* fallback below */
  }

  return fallbackPlan(goal);
}

function fallbackPlan(goal: string): AgentPlan {
  const wantsFull =
    /整篇|全文|academic-paper|一键|完整论文|从零|从头写/.test(goal);
  const wantsWrite = /写|扩写|起草|生成.*(引言|方法|结果|讨论|结论|摘要|章节|综述)/.test(goal);
  const wantsOutline = /大纲|结构|提纲|蓝图/.test(goal);
  const wantsLitOnly =
    !wantsWrite
    && (/检索|导入.*文献|找.*文献|补充.*文献|备齐.*文献/.test(goal)
      || /literature\s*review/i.test(goal));

  if (wantsLitOnly) {
    return {
      subtasks: [
        {
          id: "1",
          title: "多轮 search_knowledge / search_external（换同义英文 query）",
          status: "pending",
          toolHints: ["search_knowledge", "search_external"],
        },
        {
          id: "2",
          title: "分批 import_reference 导入约 15 篇（hitsJson；综述再抬到 30）",
          status: "pending",
          toolHints: ["import_reference"],
        },
        {
          id: "3",
          title: "list_references 核对体量后向用户汇报",
          status: "pending",
          toolHints: ["list_references"],
        },
      ],
    };
  }
  if (wantsFull) {
    return {
      subtasks: [
        { id: "1", title: "inspect_project 看清进度与缺口", status: "pending", toolHints: ["inspect_project"] },
        {
          id: "2",
          title: "检索并导入足量文献（综述级约 ≥30 篇）",
          status: "pending",
          toolHints: ["search_knowledge", "search_external", "import_reference"],
        },
        { id: "3", title: "若缺大纲则 generate_outline 并请你确认", status: "pending", toolHints: ["generate_outline"] },
        { id: "4", title: "向你汇报现状并建议下一步（停下来等你）", status: "pending" },
      ],
    };
  }
  if (wantsOutline && !wantsWrite) {
    return {
      subtasks: [
        { id: "1", title: "检索主题相关文献要点", status: "pending", toolHints: ["search_knowledge"] },
        { id: "2", title: "generate_outline 生成并写回大纲", status: "pending", toolHints: ["generate_outline"] },
        { id: "3", title: "generate_writing_blueprint 写回写作蓝图", status: "pending", toolHints: ["generate_writing_blueprint"] },
      ],
    };
  }
  if (wantsWrite && /综述|literature_body|literature\s*review/i.test(goal)) {
    return {
      subtasks: [
        {
          id: "1",
          title: "inspect / list_references 检查文献体量（目标约 ≥30 篇）",
          status: "pending",
          toolHints: ["inspect_project", "list_references"],
        },
        {
          id: "2",
          title: "不足则多轮检索并分批 import_reference",
          status: "pending",
          toolHints: ["search_external", "import_reference"],
        },
        {
          id: "3",
          title: "write_section(literature_body) 写回综述正文",
          status: "pending",
          toolHints: ["write_section"],
        },
        { id: "4", title: "向用户确认写回结果", status: "pending" },
      ],
    };
  }
  if (wantsWrite) {
    return {
      subtasks: [
        {
          id: "1",
          title: "检查并补齐大纲/写作蓝图/论证蓝图",
          status: "pending",
          toolHints: ["generate_outline", "generate_writing_blueprint", "build_argument_blueprint"],
        },
        { id: "2", title: "检索与本章相关的文献要点", status: "pending", toolHints: ["search_knowledge"] },
        { id: "3", title: "调用 write_section 生成并写回章节", status: "pending", toolHints: ["write_section"] },
        { id: "4", title: "向用户确认写回结果", status: "pending" },
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
    ...((s as { toolHints?: string[] }).toolHints
      ? { toolHints: (s as { toolHints?: string[] }).toolHints }
      : {}),
  }));
  return { subtasks };
}

/**
 * Agent 写作入口模式（对齐 academic-paper skill 的 mode 思路，精简为 3 档）
 *
 * 主入口：新建项目向导写入 PaperConfig.agentEntryMode；
 * Agent 首条消息注入 goalPrefix，会话简报也会提示入口策略。
 */

export type AgentEntryMode = "full" | "outline_ready" | "data_ready";

export interface AgentEntryModeOption {
  id: AgentEntryMode;
  /** 对齐 academic-paper 的近似模式 */
  academicPaperAnalog: string;
  label: string;
  hint: string;
  /** 注入到用户 goal 前的系统前缀（短） */
  goalPrefix: string;
}

export const AGENT_ENTRY_MODES: AgentEntryModeOption[] = [
  {
    id: "full",
    academicPaperAnalog: "full",
    label: "从零推进",
    hint: "配置 → 文献 → 大纲 → 分节写",
    goalPrefix:
      "【写作入口=full｜对齐 academic-paper full】按需补配置/文献/大纲后再写；缺什么先用工具补，不要空转催用户去别的 Tab。",
  },
  {
    id: "outline_ready",
    academicPaperAnalog: "outline-only → drafting",
    label: "已有大纲",
    hint: "按现有大纲写，不主动重做结构",
    goalPrefix:
      "【写作入口=outline_ready｜用户已有大纲】优先 read_project_asset(outline)；除非用户明确要求重做/大改，不要 generate_outline。"
      + "缺文献再 search/import；然后按大纲 write_section。",
  },
  {
    id: "data_ready",
    academicPaperAnalog: "full + data/figures",
    label: "已有数据",
    hint: "先看数据/图表，再写方法与结果",
    goalPrefix:
      "【写作入口=data_ready｜用户已有实验/分析数据】先 list_plot_sources / read_project_asset(analysis_notes)；"
      + "若还没有数据源，用 ingest_project_data（附件或粘贴 CSV）入库。"
      + "优先 methods/results 与配图（generate_chart / generate_xrd_analysis）；引言综述可后置。禁止编造数值。",
  },
];

export function getAgentEntryMode(id: string | null | undefined): AgentEntryModeOption | null {
  if (!id) return null;
  return AGENT_ENTRY_MODES.find((m) => m.id === id) ?? null;
}

/** 把入口模式前缀拼到用户目标前（已含前缀则不重复） */
export function applyEntryModeToGoal(
  goal: string,
  modeId: AgentEntryMode | null | undefined,
): string {
  const trimmed = goal.trim();
  if (!trimmed || !modeId) return trimmed;
  const mode = getAgentEntryMode(modeId);
  if (!mode) return trimmed;
  if (trimmed.includes("【写作入口=")) return trimmed;
  return `${mode.goalPrefix}\n\n用户：${trimmed}`;
}

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
      "【写作入口=full】按路线走完：文献够用再出大纲；大纲和写作蓝图都要等人批；然后按文稿顺序一节一节写。研究型结果章没有证据声明就停。目标期刊和字数贯彻到每一节。每轮只交付一步。",
  },
  {
    id: "outline_ready",
    academicPaperAnalog: "outline-only → drafting",
    label: "已有大纲",
    hint: "按现有大纲写，不主动重做结构",
    goalPrefix:
      "【写作入口=outline_ready】用户已有大纲。没要求重做或大改就不要 generate_outline。先读或请用户贴提纲，再沿用标题出蓝图并等人批，然后按提纲顺序写。缺文献只补当前节。",
  },
  {
    id: "data_ready",
    academicPaperAnalog: "full + data/figures",
    label: "已有数据",
    hint: "先看数据/图表，再写方法与结果",
    goalPrefix:
      "【写作入口=data_ready】先核对附件里的数据块和已有图，ingest_project_data 等用户在确认卡勾选后再形成证据声明。"
      + "没有声明不要出大纲、不要写结果。研究型写作顺序：方法 → 结果 → 讨论 → 引言 → 结论。"
      + "图上数值必须出现在确认卡并经用户勾选后才能当证据。禁止把没确认的读图数字写进正文，禁止先写引言。综述的图表可选，起草仍按综述顺序。",
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

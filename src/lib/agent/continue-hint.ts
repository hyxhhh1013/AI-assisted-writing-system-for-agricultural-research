import type { AgentUiMessage } from "@/contracts/agent-session";
import {
  isPlanLeftoverSpeech,
  thoughtAnnouncesUnfinishedTool,
} from "@/lib/agent/core/plan-progress";

export interface AgentContinueHint {
  eyebrow: string;
  title: string;
  detail: string;
  goal: string;
  cta: string;
}

export interface ContinueHintObservation {
  tool: string;
  success: boolean;
  sectionKey?: string;
}

const LABEL_TO_SECTION: Record<string, string> = {
  摘要: "abstract",
  引言: "introduction",
  研究现状: "background",
  综述正文: "literature_body",
  方法: "methods",
  结果: "results",
  讨论: "discussion",
  结论: "conclusion",
};

const INSPECT_GOAL = "看看项目卡在哪，建议下一步";

function lastNonEmpty(...parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim() ?? "").filter(Boolean).join("\n");
}

export function sectionKeyFromWriteTip(action: string): string | null {
  const m = action.trim().match(/^写([^并（(]+)/);
  if (!m) return null;
  return LABEL_TO_SECTION[m[1].trim()] ?? null;
}

export function sectionKeyFromPlanTitle(title: string): string | null {
  for (const [label, key] of Object.entries(LABEL_TO_SECTION)) {
    if (title.includes(label)) return key;
  }
  if (/background/i.test(title)) return "background";
  if (/introduction/i.test(title)) return "introduction";
  if (/literature_body|综述/i.test(title)) return "literature_body";
  return null;
}

function firstWriteTip(
  actions: readonly string[] | undefined,
  skipKeys: ReadonlySet<string>,
): string | null {
  return (
    actions?.find((a) => {
      if (!/^写/.test(a.trim())) return false;
      const key = sectionKeyFromWriteTip(a);
      return !key || !skipKeys.has(key);
    }) ?? null
  );
}

function shortWriteTitle(action: string): string {
  const m = action.trim().match(/^写([^并（(]+)/);
  return m ? `撰写${m[1].trim()}` : action.trim().slice(0, 20);
}

function firstOpenPlanTitle(
  planSubtasks: ReadonlyArray<{ title: string; status: string }> | undefined,
  skipKeys: ReadonlySet<string>,
): string | null {
  const open = planSubtasks?.filter(
    (s) => s.status === "running" || s.status === "pending",
  ) ?? [];
  for (const s of open) {
    const key = sectionKeyFromPlanTitle(s.title);
    if (key && skipKeys.has(key)) continue;
    const title = s.title.trim();
    if (title) return title;
  }
  return null;
}

/** 只看上一句用户之后的本轮信号，避免上一轮「口头未执行」摘要污染 */
export function collectTurnContinueSignals(messages: readonly AgentUiMessage[]): {
  lastAssistantText: string | null;
  lastSummaryText: string | null;
  observations: ContinueHintObservation[];
  writtenSectionKeys: string[];
} {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === "user") {
      lastUser = i;
      break;
    }
  }
  const slice = lastUser >= 0 ? messages.slice(lastUser + 1) : messages;
  let lastAssistantText: string | null = null;
  let lastSummaryText: string | null = null;
  const observations: ContinueHintObservation[] = [];
  const writtenSectionKeys: string[] = [];
  for (const m of slice) {
    if (m.kind === "thought") lastAssistantText = m.text;
    if (m.kind === "summary") lastSummaryText = m.summary.text;
    if (m.kind !== "observation") continue;
    const success = !m.error;
    observations.push({
      tool: m.tool,
      success,
      ...(m.sectionKey ? { sectionKey: m.sectionKey } : {}),
    });
    if (success && m.tool === "write_section" && m.sectionKey) {
      writtenSectionKeys.push(m.sectionKey);
    }
  }
  return { lastAssistantText, lastSummaryText, observations, writtenSectionKeys };
}

/**
 * 输入区「继续推进」条。
 * 本轮已成功 write_section 时禁止再显示「只宣布了」或重复写同一节。
 */
export function resolveAgentContinueHint(input: {
  lastAssistantText?: string | null;
  lastSummaryText?: string | null;
  planSubtasks?: ReadonlyArray<{ title: string; status: string }>;
  suggestedActions?: readonly string[];
  observations?: readonly ContinueHintObservation[];
  skipSectionKeys?: readonly string[];
}): AgentContinueHint {
  const skipKeys = new Set(input.skipSectionKeys ?? []);
  for (const o of input.observations ?? []) {
    if (o.success && o.sectionKey) skipKeys.add(o.sectionKey);
  }
  const wroteThisTurn = (input.observations ?? []).some(
    (o) => o.tool === "write_section" && o.success,
  );

  const blob = lastNonEmpty(input.lastAssistantText, input.lastSummaryText);
  const leftover = isPlanLeftoverSpeech(blob);
  const announced = wroteThisTurn || leftover
    ? null
    : thoughtAnnouncesUnfinishedTool(blob, input.observations ?? []);
  const writeTip = firstWriteTip(input.suggestedActions, skipKeys);
  const planTitle = firstOpenPlanTitle(input.planSubtasks, skipKeys);

  if (planTitle) {
    return {
      eyebrow: "计划还没走完",
      title: planTitle,
      detail: "按当前子任务接着做，不要另起一节",
      goal: "继续",
      cta: "继续推进",
    };
  }

  if (announced) {
    return {
      eyebrow: "上一轮只宣布了，还没执行",
      title: writeTip ? shortWriteTitle(writeTip) : announced.label,
      detail: writeTip ?? "按上一轮意图接着做，不另起炉灶",
      goal: writeTip ?? "继续",
      cta: "继续推进",
    };
  }

  if (wroteThisTurn) {
    return {
      eyebrow: "这一轮已写回",
      title: writeTip
        ? shortWriteTitle(writeTip)
        : (planTitle ?? "可以进入下一节"),
      detail: writeTip ?? planTitle ?? "先看还缺哪一节，再决定写什么",
      goal: writeTip ?? INSPECT_GOAL,
      cta: "继续推进",
    };
  }

  if (writeTip) {
    return {
      eyebrow: "建议下一步",
      title: shortWriteTitle(writeTip),
      detail: writeTip,
      goal: writeTip,
      cta: "继续推进",
    };
  }

  return {
    eyebrow: "接着上一轮",
    title: "继续推进",
    detail: "继承刚才的意图，不必重新下指令",
    goal: "继续",
    cta: "继续推进",
  };
}

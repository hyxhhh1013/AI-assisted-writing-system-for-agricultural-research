import type { AgentUiMessage } from "@/contracts/agent-session";
import type { WritingQaReport } from "@/contracts/writing-qa";
import {
  parseWritingQaReport,
  writingQaContinueFindings,
} from "@/contracts/writing-qa";
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
  qaReport?: WritingQaReport;
}

const SECTION_LABEL: Record<string, string> = {
  abstract: "摘要",
  introduction: "引言",
  background: "研究现状",
  literature_body: "综述正文",
  methods: "方法",
  results: "结果",
  discussion: "讨论",
  conclusion: "结论",
};

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

export const INSPECT_GOAL = "看看项目卡在哪，建议下一步";

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

export function skipSectionKeysAfterWrite(
  written: readonly string[],
  thinOrGap?: readonly string[],
): string[] {
  const thin = new Set(thinOrGap ?? []);
  return written.filter((k) => Boolean(k) && !thin.has(k));
}

export function peekSectionKeyFromContinueHint(hint: AgentContinueHint): string | null {
  return sectionKeyFromWriteTip(hint.goal) ?? sectionKeyFromPlanTitle(hint.title);
}

export function formatWriteQaContinueHint(report: WritingQaReport, sectionKey?: string): AgentContinueHint {
  const items = writingQaContinueFindings(report);
  const first = items[0] ?? report.findings[0];
  const label = (sectionKey && SECTION_LABEL[sectionKey]) || "本节";
  const blocked = report.verdict === "block";
  const codes = items.slice(0, 3).map((f) => f.code).join("、");
  const title = first?.message?.replace(/^\[[a-z][a-z0-9_]*\]\s/, "") || "写节质检待处理";
  const detail = codes
    ? `${blocked ? "未写入章节" : "已写回，先看质检"}：${codes}`
    : blocked
      ? "质检未过线，正文未写入章节"
      : "已写回，可按质检改一刀";
  return {
    eyebrow: blocked ? "这一轮未写回" : "写节质检",
    title: title.slice(0, 48),
    detail,
    goal: `修补已写的${label}（${first?.code ?? "质检"}）：${title.slice(0, 80)}`,
    cta: "继续推进",
  };
}

function lastWriteQaObservation(
  observations: readonly ContinueHintObservation[] | undefined,
): ContinueHintObservation | null {
  const list = observations ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (o.tool === "write_section" && o.qaReport) return o;
  }
  return null;
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
    const qaReport = m.tool === "write_section"
      ? parseWritingQaReport(
          m.data && typeof m.data === "object"
            ? (m.data as { qaReport?: unknown }).qaReport
            : undefined,
        ) ?? undefined
      : undefined;
    observations.push({
      tool: m.tool,
      success,
      ...(m.sectionKey ? { sectionKey: m.sectionKey } : {}),
      ...(qaReport ? { qaReport } : {}),
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
  thinOrGapSections?: readonly string[];
}): AgentContinueHint {
  const skipKeys = new Set(input.skipSectionKeys ?? []);
  const thin = new Set(input.thinOrGapSections ?? []);
  for (const o of input.observations ?? []) {
    if (o.success && o.sectionKey && !thin.has(o.sectionKey)) {
      skipKeys.add(o.sectionKey);
    }
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
  const writeQa = lastWriteQaObservation(input.observations);
  const qaActionable = writeQa?.qaReport
    ? writingQaContinueFindings(writeQa.qaReport).length > 0
      || writeQa.qaReport.verdict === "block"
    : false;

  if (qaActionable && writeQa?.qaReport) {
    return formatWriteQaContinueHint(writeQa.qaReport, writeQa.sectionKey);
  }

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

/**
 * 「现在在哪一步、下一步干什么」的唯一计算。
 * 判断条件从 suggestNextAgentActions 原样搬来，本模块不改文案、不改分支。
 */

import type { IntentKind } from "@/contracts/agent-intent";
import type { AgentPhaseId, AgentPhaseState } from "@/contracts/agent-phase";
import type { AgentEntryModeId } from "@/contracts/paper-passport";
import { nextResearchTemplateSection, resolveEntryRoutePhase } from "@/lib/agent/entry-route";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";

export interface SuggestNextAgentActionsInput {
  currentPhase?: number | null;
  writeEnabled: boolean;
  hasOutline: boolean;
  /** @deprecated 论证已并入写作蓝图；保留字段以免旧调用方崩 */
  hasArgumentBlueprint?: boolean;
  hasWritingBlueprint?: boolean;
  emptySections: string[];
  /** 项目已有参考文献条数；有文献时不要再推「检索」开场 */
  referenceCount?: number;
  nextSectionKey?: string | null;
  thinOrGapSections?: string[];
  /** 未选定 / full 时不改原下一步文案 */
  entryMode?: AgentEntryModeId | null;
  paperMode?: "review" | "research";
  claimCount?: number;
  sectionChars?: Record<string, number>;
  /** 研究型起草顺序。缺省按 sci */
  template?: string;
}

export interface ResolveAgentPhaseInput {
  snapshot?: AgentProjectSnapshot | null;
  /** 入口意图。阶段过滤上线前不参与「下一步」文案 */
  intentKind?: IntentKind | null;
  writeEnabled?: boolean;
  /** resolvePhaseTaskPack 的阶段覆盖；0 是合法的配置阶段 */
  phaseOverride?: number | null;
}

const DONE_WHEN: Record<AgentPhaseId, string> = {
  config: "题目、类型、语言、引用格式齐",
  literature: "本轮导入至少一批，或文献数达到目标，或用户说够了",
  outline: "大纲和写作蓝图都经用户批准",
  draft: "用户点名的那一节写回且质检结论已出，然后停下问下一节",
  citation: "导出就绪且无错引，或用户说先这样",
  abstract: "双语摘要写回",
  review: "满 2 轮，或修订路线图逐条处理完，或用户说停",
  diagnose: "已查看项目并给出缺口与一个下一步",
};

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

function sectionLabel(key: string): string {
  return SECTION_LABEL[key] ?? key;
}

function writeTargetOf(input: SuggestNextAgentActionsInput): string | null {
  return (
    input.nextSectionKey
    || input.thinOrGapSections?.[0]
    || (input.emptySections.includes("introduction")
      ? "introduction"
      : input.emptySections.find((k) => k !== "abstract"))
    || null
  );
}

function writeSectionTip(input: SuggestNextAgentActionsInput, target: string): string {
  const thinHint =
    input.thinOrGapSections?.includes(target)
    && !input.emptySections.includes(target)
      ? "（当前偏薄，建议扩写/补强）"
      : "";
  return `写${sectionLabel(target)}并保存到当前项目${thinHint}`;
}

function phaseState(
  phase: AgentPhaseId,
  packPhase: number,
  nextAction: string | null,
  extra?: Pick<AgentPhaseState, "subStep" | "nextSectionKey">,
): AgentPhaseState {
  return {
    phase,
    packPhase,
    nextAction,
    doneWhen: DONE_WHEN[phase],
    ...extra,
  };
}

function passportPhaseId(packPhase: number): AgentPhaseId {
  if (packPhase <= 0) return "config";
  if (packPhase === 1) return "literature";
  if (packPhase === 2 || packPhase === 3) return "outline";
  if (packPhase === 4) return "draft";
  if (packPhase === 5) return "citation";
  if (packPhase === 6) return "abstract";
  return "review";
}

/** 原 suggestNextAgentActions 的分支，原样产出主建议，并带上阶段 id */
export function resolveAgentPhaseFromSignals(
  input: SuggestNextAgentActionsInput,
): AgentPhaseState {
  const phase = input.currentPhase;
  const hasOutline = input.hasOutline;
  const writeEnabled = input.writeEnabled;
  const templateWrite = input.sectionChars
    ? nextResearchTemplateSection({
      entryMode: input.entryMode,
      template: input.template,
      sectionChars: input.sectionChars,
      thinKeys: input.thinOrGapSections,
    })
    : null;
  const writeTarget = input.paperMode === "research"
    ? (templateWrite ?? writeTargetOf(input))
    : writeTargetOf(input);
  const refN = input.referenceCount ?? 0;

  const routed = resolveEntryRoutePhase({
    entryMode: input.entryMode ?? null,
    paperMode: input.paperMode === "research" ? "research" : "review",
    hasOutline,
    hasWritingBlueprint: Boolean(input.hasWritingBlueprint),
    referenceCount: refN,
    claimCount: input.claimCount ?? 0,
    currentPhase: phase ?? null,
    sectionChars: input.sectionChars ?? {},
    thinKeys: input.thinOrGapSections,
    writeEnabled,
    template: input.template,
  });
  if (routed) {
    return phaseState(routed.phase, routed.packPhase, routed.nextAction, {
      ...(routed.subStep ? { subStep: routed.subStep } : {}),
      ...(routed.nextSectionKey ? { nextSectionKey: routed.nextSectionKey } : {}),
    });
  }

  if ((phase ?? 0) >= 7) {
    return phaseState("review", 7, "运行下一轮论文审查");
  }
  if ((phase ?? 1) <= 1 && !hasOutline) {
    if (refN >= 1) {
      return phaseState(
        "outline",
        2,
        "确认论文题目后生成大纲与写作蓝图并写回项目",
        { subStep: "outline" },
      );
    }
    return phaseState("literature", 1, "按本题检索并导入相关文献");
  }
  if (!hasOutline) {
    return phaseState("outline", 2, "生成大纲与写作蓝图并写回项目", { subStep: "outline" });
  }
  if (!input.hasWritingBlueprint) {
    return phaseState(
      "outline",
      3,
      "基于大纲生成写作蓝图（含各节主张/证据）并写回项目",
      { subStep: "blueprint" },
    );
  }
  if (writeEnabled && writeTarget) {
    return phaseState("draft", 4, writeSectionTip(input, writeTarget), {
      nextSectionKey: writeTarget,
    });
  }
  if ((phase ?? 0) >= 6) {
    return phaseState("abstract", 6, "基于已写正文生成中英双语摘要并写回项目");
  }
  if ((phase ?? 0) >= 5) {
    return phaseState("citation", 5, "检查当前引用");
  }
  if (writeEnabled) {
    return phaseState("draft", 4, "查看可配图数据并生成图表", {
      ...(writeTarget ? { nextSectionKey: writeTarget } : {}),
    });
  }
  const packPhase = phase ?? 1;
  const id = hasOutline && input.hasWritingBlueprint ? "draft" : passportPhaseId(packPhase);
  return phaseState(id, id === "draft" ? 4 : packPhase, null, {
    ...(id === "outline" ? { subStep: hasOutline ? "blueprint" : "outline" } : {}),
    ...(writeTarget ? { nextSectionKey: writeTarget } : {}),
  });
}

function signalsFromSnapshot(input: ResolveAgentPhaseInput): SuggestNextAgentActionsInput {
  const snapshot = input.snapshot;
  const currentPhase =
    input.phaseOverride != null
      ? input.phaseOverride
      : snapshot?.currentPhase != null
        ? snapshot.currentPhase
        : null;
  const outline = snapshot?.outline?.trim() ?? "";
  const coverage = snapshot
    ? evaluateDraftCoverage({
        mode: snapshot.mode,
        language: snapshot.language,
        sectionChars: sectionCharsFromFills(snapshot.sectionFills),
      })
    : null;
  return {
    currentPhase,
    writeEnabled: input.writeEnabled ?? true,
    hasOutline: outline.length >= 20,
    hasWritingBlueprint: Boolean(snapshot?.hasWritingBlueprint),
    emptySections: (snapshot?.sectionFills ?? [])
      .filter((s) => s.chars === 0 && s.key !== "abstract")
      .map((s) => s.key),
    referenceCount: snapshot?.references.length ?? 0,
    entryMode: snapshot?.agentEntryMode ?? null,
    paperMode: snapshot?.mode === "research" ? "research" : "review",
    template: snapshot?.template || "sci",
    claimCount: snapshot?.dataClaims.length ?? 0,
    sectionChars: Object.fromEntries(
      (snapshot?.sectionFills ?? []).map((s) => [s.key, s.chars]),
    ),
    nextSectionKey: coverage?.nextSectionKey,
    thinOrGapSections: coverage
      ? [...coverage.requiredGaps, ...coverage.thinKeys]
      : undefined,
  };
}

export function resolveAgentPhase(input: ResolveAgentPhaseInput): AgentPhaseState {
  void input.intentKind;
  return resolveAgentPhaseFromSignals(signalsFromSnapshot(input));
}

/**
 * 薄包装：主建议仍是这一条字符串。新调用方用 resolveAgentPhase。
 */
export function suggestNextAgentActions(input: SuggestNextAgentActionsInput): string[] {
  const next = resolveAgentPhaseFromSignals(input).nextAction;
  return next ? [next] : [];
}

/**
 * 三条写作入口的整条路线（配置之后到审查）。
 * 未选定或「从零推进」不改现有下一步文案，只提供简报与开局页。
 * 「已有大纲」「已有数据」每次按项目现状重算下一站。
 */

import type { AgentPhaseId } from "@/contracts/agent-phase";
import type { AgentEntryModeId } from "@/contracts/paper-passport";
import { getTemplateSections } from "@/lib/template-sections";

const DRAFT_MIN_CHARS = 80;

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

const REVIEW_DRAFT = ["introduction", "background", "literature_body", "conclusion"] as const;
const RESEARCH_DRAFT = ["introduction", "methods", "results", "discussion", "conclusion"] as const;
const DATA_RESEARCH_DRAFT = ["methods", "results", "discussion", "introduction", "conclusion"] as const;

export function userAskedToRegenerateOutline(goal: string): boolean {
  return /重做|大改|重新生成|重写大纲|换一版|生成大纲|出一版大纲|出个大纲/.test(goal);
}

export function draftSectionOrder(
  entryMode: AgentEntryModeId | null | undefined,
  paperMode: "review" | "research",
  template?: string,
): readonly string[] {
  if (entryMode === "data_ready" && paperMode === "research") return DATA_RESEARCH_DRAFT;
  if (paperMode !== "research") return REVIEW_DRAFT;
  const keys = getTemplateSections(template || "sci", "research").map((def) => def.key);
  return keys.length > 0 ? keys : RESEARCH_DRAFT;
}

/** 研究型、非「已有数据」时，按模板章节挑下一节。sectionChars 缺省视为未写。 */
export function nextResearchTemplateSection(input: {
  entryMode: AgentEntryModeId | null | undefined;
  template?: string;
  sectionChars: Record<string, number>;
  thinKeys?: readonly string[];
}): string | null {
  if (input.entryMode === "data_ready") return null;
  const thin = new Set(input.thinKeys ?? []);
  for (const key of draftSectionOrder(input.entryMode, "research", input.template)) {
    const chars = input.sectionChars[key] ?? 0;
    if (chars < DRAFT_MIN_CHARS || thin.has(key)) return key;
  }
  return null;
}

export function formatEntryRouteBrief(
  entryMode: AgentEntryModeId | null | undefined,
  paperMode: "review" | "research",
  template?: string,
): string {
  if (entryMode === "outline_ready") {
    const order = paperMode === "research"
      ? draftSectionOrder("outline_ready", "research", template).map((key) => SECTION_LABEL[key] ?? key).join(" → ")
      : "引言 → 研究现状/综述正文 → 结论";
    return `路线：已有大纲。默认不要 generate_outline，除非用户要求重做、大改或明确要生成大纲。先贴上或读已有提纲，再沿用一级标题出写作蓝图并等人批。蓝图写作顺序是建议，用户确认时可以改。批准后只写顺序里第一个还没写完的路径，同一章的子节写完再换章；用户点名某一节时写那一节。期刊模板顺序（${order}）只在生成蓝图时作参考。缺文献只在用户要求配引用时补。提纲改过则蓝图批准作废，已写章节不要自动重写。目标期刊和字数写进蓝图和每一节。`;
  }
  if (entryMode === "data_ready") {
    if (paperMode === "review") {
      return "路线：已有数据，本稿是综述。图表或表格可以先入库，没有图表就按题目补文献。写作顺序的建议是引言 → 研究现状/综述正文 → 结论，用户在蓝图里可以改。批准后按蓝图顺序写。禁止编造数值。目标期刊和字数写进蓝图和每一节。";
    }
    return "路线：已有数据。先把表格收成证据声明，没有声明不要出大纲、不要写结果。再按数据和题目出大纲（结果节对得上声明）并等人批，蓝图配图绑定真实数据源并等人批。写作顺序的建议是方法 → 结果 → 讨论 → 引言 → 结论，用户在蓝图里可以改。每一行还有档位：方法、结果、讨论默认写完停；引言和结论默认连着写。批准后按这一批写，不要一次写完全文。禁止编造数值。机理图和示意图等用户点名再画。目标期刊和字数写进蓝图和每一节。";
  }
  if (entryMode === "full") {
    const order = paperMode === "research"
      ? draftSectionOrder("full", "research", template).map((key) => SECTION_LABEL[key] ?? key).join(" → ")
      : "引言 → 研究现状/综述正文 → 结论";
    return `路线：从零推进。文献够用或用户说停再出大纲；先问出一版还是贴骨架，大纲和蓝图都要等人批。蓝图写作顺序是建议，用户确认时可以改。批准后只写顺序里第一个还没写完的路径；模板顺序（${order}）只在生成蓝图时作参考。研究型结果章没有证据声明就停，不要编造数值。目标期刊和字数写进蓝图和每一节。`;
  }
  return "";
}

export function outlineRouteHint(
  entryMode: AgentEntryModeId | null | undefined,
  paperMode: "review" | "research",
): string | undefined {
  if (entryMode === "data_ready" && paperMode === "research") {
    return "结果与讨论的小节必须对得上已有证据声明和图表，不要为没有数据的指标单列一节。";
  }
  if (entryMode === "outline_ready") {
    return "用户已有大纲。若调用本工具，说明用户要求重做；仍优先保留用户给出的一级标题。";
  }
  return undefined;
}

export function blueprintRouteHint(
  entryMode: AgentEntryModeId | null | undefined,
  paperMode: "review" | "research",
): string | undefined {
  if (entryMode === "outline_ready") {
    return "沿用大纲里的一级标题，只补主张、证据、字数和配图，不要改一级标题。";
  }
  if (entryMode === "data_ready" && paperMode === "research") {
    return "配图计划绑定已有数据源。writingOrder 建议为方法 → 结果 → 讨论 → 引言 → 结论，用户可以改。writingPace 与顺序等长：方法、结果、讨论用 step（写完停），引言和结论用 together（连着写）。机理图和示意图标 optional，不要标成写节时必做。不要规划尚无数据的实测图。";
  }
  if (entryMode === "data_ready") {
    return "综述配图只用已入库的图表或概念图，不要安排本试验数据图。";
  }
  return undefined;
}

/** 已有大纲且提纲还空时打开提纲。研究型空项目留在对话，不自动打开实验数据。 */
export function openingWorkbenchTab(input: {
  entryMode: AgentEntryModeId | null | undefined;
  outlineChars: number;
}): "outline" | null {
  if (input.entryMode === "outline_ready" && input.outlineChars < 20) return "outline";
  return null;
}

export interface EntryRoutePhaseInput {
  entryMode: AgentEntryModeId | null | undefined;
  paperMode: "review" | "research";
  hasOutline: boolean;
  hasWritingBlueprint: boolean;
  referenceCount: number;
  claimCount: number;
  currentPhase: number | null;
  sectionChars: Record<string, number>;
  thinKeys?: readonly string[];
  writeEnabled: boolean;
  template?: string;
}

export interface EntryRoutePhase {
  phase: AgentPhaseId;
  packPhase: number;
  nextAction: string;
  subStep?: string;
  nextSectionKey?: string | null;
}

function sectionCharsOf(input: EntryRoutePhaseInput, key: string): number {
  return input.sectionChars[key] ?? 0;
}

function nextDraftSection(input: EntryRoutePhaseInput, order: readonly string[]): string | null {
  const thin = new Set(input.thinKeys ?? []);
  for (const key of order) {
    if (sectionCharsOf(input, key) < DRAFT_MIN_CHARS || thin.has(key)) return key;
  }
  return null;
}

function hasSubstantialDraft(input: EntryRoutePhaseInput, order: readonly string[]): boolean {
  return order.some((key) => sectionCharsOf(input, key) >= 200);
}

function writeTip(key: string, thin: boolean): string {
  const label = SECTION_LABEL[key] ?? key;
  return `写${label}并保存到当前项目${thin ? "（当前偏薄，建议扩写/补强）" : ""}`;
}

function tailPhase(input: EntryRoutePhaseInput, bodyDone: boolean): EntryRoutePhase | null {
  const phase = input.currentPhase ?? 0;
  if (phase >= 7) {
    return { phase: "review", packPhase: 7, nextAction: "运行下一轮论文审查" };
  }
  if (!bodyDone) return null;
  if (phase >= 6) {
    return {
      phase: "abstract",
      packPhase: 6,
      nextAction: "基于已写正文生成中英双语摘要并写回项目",
    };
  }
  return { phase: "citation", packPhase: 5, nextAction: "检查当前引用" };
}

/** 已有大纲 / 已有数据的下一站。从零推进和未选定返回 null，沿用原阶段机。 */
export function resolveEntryRoutePhase(input: EntryRoutePhaseInput): EntryRoutePhase | null {
  const mode = input.entryMode;
  if (mode !== "outline_ready" && mode !== "data_ready") return null;

  const order = draftSectionOrder(mode, input.paperMode, input.template);
  const draftKey = nextDraftSection(input, order);
  const bodyDone = draftKey == null;
  const tail = tailPhase(input, bodyDone);
  if ((input.currentPhase ?? 0) >= 7) return tail;
  if (bodyDone && (input.currentPhase ?? 0) >= 5) return tail;

  if (mode === "data_ready" && input.paperMode === "review") {
    if (
      !input.hasOutline
      && input.claimCount === 0
      && input.referenceCount === 0
      && !hasSubstantialDraft(input, order)
    ) {
      return {
        phase: "literature",
        packPhase: 1,
        nextAction: "导入要放进综述的图表或表格；没有图表就按题目检索并导入文献",
      };
    }
    return null;
  }

  if (mode === "data_ready" && input.paperMode === "research") {
    if (input.claimCount === 0 && !hasSubstantialDraft(input, order)) {
      return {
        phase: "literature",
        packPhase: 1,
        nextAction: "导入实验表格或粘贴 CSV，形成证据声明。没有声明之前不要出大纲，也不要写结果",
      };
    }
    if (!input.hasOutline) {
      return {
        phase: "outline",
        packPhase: 2,
        subStep: "outline",
        nextAction: "按已有数据和题目生成大纲（结果节必须对得上证据声明）并写回项目",
      };
    }
    if (!input.hasWritingBlueprint) {
      return {
        phase: "outline",
        packPhase: 3,
        subStep: "blueprint",
        nextAction: "基于大纲和真实数据源生成写作蓝图（配图绑定已有数据）并写回项目",
      };
    }
  }

  if (mode === "outline_ready") {
    if (!input.hasOutline) {
      return {
        phase: "outline",
        packPhase: 2,
        subStep: "outline",
        nextAction: "把已有大纲贴进论证提纲。贴上之前不要生成新大纲，也不要先检索文献",
      };
    }
    if (!input.hasWritingBlueprint) {
      return {
        phase: "outline",
        packPhase: 3,
        subStep: "blueprint",
        nextAction: "沿用已有大纲生成写作蓝图（不改一级标题）并写回项目",
      };
    }
  }

  if (input.writeEnabled && draftKey) {
    const thin = (input.thinKeys ?? []).includes(draftKey)
      && sectionCharsOf(input, draftKey) >= DRAFT_MIN_CHARS;
    return {
      phase: "draft",
      packPhase: 4,
      nextAction: writeTip(draftKey, thin),
      nextSectionKey: draftKey,
    };
  }

  if (bodyDone) {
    return { phase: "citation", packPhase: 5, nextAction: "检查当前引用" };
  }

  return null;
}

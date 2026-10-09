/**
 * Agent 写章节时把「写作蓝图」接到 Writer 管道（与工作台扩写面板对齐）。
 * 修复：loader 曾把 WritingBlueprint 误当作 WritingGlobalContext，导致
 * prepare-context 读不到 globalContext.blueprint，且 write_section 未注入本节要点。
 */

import type { WritingGlobalContext } from "@/app/api/writing/types";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import {
  figureBelongsToSection,
  stripBlueprintSectionHint,
} from "@/lib/blueprint-utils";
import { getSectionLabelForMode } from "@/lib/section-registry";
import { buildOutlineTasks, mapToSectionForMode } from "@/lib/utils";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  manuscriptSubsectionTitle,
  subsectionHeadingPattern,
} from "@/lib/writing-merge";

const BLUEPRINT_SECTION_HINT_HEAD = "【写作蓝图（本节）】";

/** 英文 section key → 蓝图/大纲用的中文（或英）顶层路径 */
export function resolveBlueprintSectionPathForKey(
  sectionKey: string,
  outline: string,
  mode: ProjectWritingMode | undefined,
  blueprint: WritingBlueprint | null | undefined,
  language: "zh" | "en" = "zh",
): string {
  // 优先蓝图路径（无「1 引言」这类编号前缀，与 sectionGuides/figurePlan 一致）
  if (blueprint) {
    for (const g of blueprint.sectionGuides) {
      if (mapToSectionForMode(g.sectionPath, mode) === sectionKey) {
        return g.sectionPath.split(">")[0].trim();
      }
    }
    for (const orderPath of blueprint.writingOrder) {
      if (mapToSectionForMode(orderPath, mode) === sectionKey) {
        return orderPath.split(">")[0].trim();
      }
    }
  }

  const tasks = buildOutlineTasks(outline, mode).filter(
    (t) => t.sectionKey === sectionKey,
  );
  if (tasks.length > 0) {
    const shortest = [...tasks].sort(
      (a, b) => a.fullPath.length - b.fullPath.length,
    )[0];
    return shortest.fullPath.split(">")[0].trim();
  }

  const label = getSectionLabelForMode(sectionKey, mode, language);
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || sectionKey;
}

/** 聚合该 sectionKey 下全部 sectionGuides + 配图（整节扩写时比单路径 find 更稳） */
export function formatBlueprintSectionHintForKey(
  blueprint: WritingBlueprint,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  sectionPath: string,
): string {
  const guides = blueprint.sectionGuides.filter((g) => {
    const top = g.sectionPath.split(">")[0].trim();
    return (
      mapToSectionForMode(g.sectionPath, mode) === sectionKey
      || g.sectionPath === sectionPath
      || g.sectionPath.startsWith(`${sectionPath} > `)
      || sectionPath.startsWith(`${g.sectionPath} > `)
      || top === sectionPath
    );
  });
  const figures = blueprint.figurePlan.items.filter(
    (item) =>
      mapToSectionForMode(item.sectionPath, mode) === sectionKey
      || figureBelongsToSection(item.sectionPath, sectionPath),
  );

  const parts: string[] = [BLUEPRINT_SECTION_HINT_HEAD];
  const pushGuideArgs = (g: (typeof guides)[number], indent = "") => {
    if (g.claim?.trim()) parts.push(`${indent}- 主张：${g.claim.trim()}`);
    if (g.evidenceHint?.trim()) {
      parts.push(`${indent}- 证据：${g.evidenceHint.trim()}`);
    }
    if (g.warrant?.trim()) parts.push(`${indent}- 推理：${g.warrant.trim()}`);
    if (g.rebuttal?.objection?.trim()) {
      parts.push(
        `${indent}- 预期反驳：${g.rebuttal.objection.trim()} → ${g.rebuttal.response?.trim() || "（待回应）"}`,
      );
    }
  };

  if (guides.length === 1) {
    const g = guides[0];
    parts.push(`- 本节目的：${g.purpose}`);
    if (g.keyPoints.length > 0) {
      parts.push(`- 要点：${g.keyPoints.join("；")}`);
    }
    pushGuideArgs(g);
  } else if (guides.length > 1) {
    parts.push("- 本节目的与要点（按蓝图子路径）：");
    for (const g of guides) {
      const kp =
        g.keyPoints.length > 0 ? `；要点：${g.keyPoints.join("；")}` : "";
      parts.push(
        `  · ${manuscriptSubsectionTitle(g.sectionPath)}：${g.purpose}${kp}`,
      );
      pushGuideArgs(g, "    ");
    }
  }
  if (figures.length > 0) {
    parts.push("- 规划配图：");
    for (const fig of figures) {
      const req = fig.priority === "required" ? "必需" : "可选";
      parts.push(
        `  · [${fig.type}] ${fig.suggestedCaption}（${req}）— ${fig.purpose}`,
      );
    }
  }
  const assigned = guides.flatMap((g) => g.assignedSources ?? []).filter(Boolean);
  if (assigned.length > 0) {
    parts.push(
      `- 优先文献源：${[...new Set(assigned)].slice(0, 8).join("；")}`,
    );
  }
  if (parts.length === 1) return "";
  return `${parts.join("\n")}\n`;
}

/**
 * 蓝图中映射到某 sectionKey 的子节路径列表。
 * 有 ≥2 条含「 > 」的嵌套路径时优先返回嵌套；否则返回全部匹配路径。
 * 用于综述 literature_body：禁止一次写整章时列出应分批的 subsectionTitle。
 */
export function listBlueprintSubsectionPathsForKey(
  blueprint: WritingBlueprint | null | undefined,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
): string[] {
  if (!blueprint) return [];
  const paths = blueprint.sectionGuides
    .map((g) => g.sectionPath.trim())
    .filter(
      (p) => p.length > 0 && mapToSectionForMode(p, mode) === sectionKey,
    );
  const unique = [...new Set(paths)];
  const nested = unique.filter((p) => p.includes(">"));
  return nested.length >= 2 ? nested : unique;
}

export function subsectionPathLeaf(path: string): string {
  return manuscriptSubsectionTitle(path);
}

export function bodyCoversSubsectionTitle(body: string, title: string): boolean {
  const t = manuscriptSubsectionTitle(title);
  if (!t) return true;
  const padded = `\n${body.replace(/\r\n/g, "\n")}\n`;
  return subsectionHeadingPattern(t).test(padded);
}

export function firstMissingBlueprintSubsection(
  blueprint: WritingBlueprint | null | undefined,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  body: string,
): string | null {
  const paths = listBlueprintSubsectionPathsForKey(blueprint, sectionKey, mode);
  if (paths.length < 2) return null;
  for (const p of paths) {
    const leaf = subsectionPathLeaf(p);
    if (!bodyCoversSubsectionTitle(body, leaf)) return p;
  }
  return null;
}

const NEXT_WRITE_SECTION_ORDER = ["background", "literature_body"] as const;
const MIN_SECTION_CHARS = 80;

const SECTION_NAME_ALIASES: Record<string, readonly string[]> = {
  introduction: ["引言", "introduction"],
  methods: ["方法", "methods"],
  results: ["结果", "results"],
  discussion: ["讨论", "discussion"],
  conclusion: ["结论", "conclusion"],
  abstract: ["摘要", "abstract"],
  literature_body: ["综述正文", "literature"],
  background: ["研究现状", "background"],
};

/** 把 writingOrder 展开成要逐个写完的路径。某一项下面有更深的 sectionGuides 时，按那些子路径走。 */
export function expandBlueprintWritePaths(
  blueprint: WritingBlueprint | null | undefined,
): string[] {
  if (!blueprint || blueprint.writingOrder.length === 0) return [];
  const guides = blueprint.sectionGuides
    .map((g) => g.sectionPath.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of blueprint.writingOrder) {
    const item = raw.trim();
    if (!item) continue;
    const deeper = guides.filter(
      (g) => g.startsWith(`${item} > `) || g.startsWith(`${item}>`),
    );
    const paths = deeper.length > 0 ? deeper : [item];
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

export function blueprintPathIsWritten(
  path: string,
  mode: ProjectWritingMode | undefined,
  sectionBodies: Record<string, string>,
): boolean {
  const key = mapToSectionForMode(path, mode);
  const body = sectionBodies[key] ?? "";
  if (path.includes(">")) {
    return bodyCoversSubsectionTitle(body, subsectionPathLeaf(path));
  }
  return body.replace(/\s+/g, "").length >= MIN_SECTION_CHARS;
}

export function firstUnfinishedBlueprintPath(opts: {
  mode: ProjectWritingMode | undefined;
  blueprint: WritingBlueprint | null | undefined;
  sectionBodies: Record<string, string>;
}): string | null {
  for (const path of expandBlueprintWritePaths(opts.blueprint)) {
    if (!blueprintPathIsWritten(path, opts.mode, opts.sectionBodies)) return path;
  }
  return null;
}

const CONTINUE_ONLY = /^(继续|接着写?|往下写?|好的?|可以|行|嗯|开始写吧?|写吧)[。！!]?$/;

/** 用户这句点了要写的节。单独说「继续」不算点名。 */
export function userNamedWriteTarget(
  goal: string,
  sectionKey: string,
  subsectionTitle: string,
  path: string,
): boolean {
  const trimmed = goal.trim();
  if (!trimmed || CONTINUE_ONLY.test(trimmed)) return false;
  const leaf = manuscriptSubsectionTitle(subsectionTitle || path);
  if (leaf.length >= 2 && goal.includes(leaf)) return true;
  if (path && goal.includes(path)) return true;
  const aliases = SECTION_NAME_ALIASES[sectionKey] ?? [];
  const lower = goal.toLowerCase();
  return aliases.some((word) => lower.includes(word.toLowerCase()));
}

function requestMatchesBlueprintPath(
  sectionKey: string,
  subsectionTitle: string,
  path: string,
  mode: ProjectWritingMode | undefined,
): boolean {
  if (mapToSectionForMode(path, mode) !== sectionKey) return false;
  if (!path.includes(">")) return true;
  const leaf = manuscriptSubsectionTitle(path);
  const sub = manuscriptSubsectionTitle(subsectionTitle);
  if (!sub) return false;
  return sub === leaf || sub.includes(leaf) || leaf.includes(sub);
}

/**
 * 已有蓝图顺序时，没写完当前路径就不能写后面的。
 * 用户点名某一节时放行。没有 writingOrder 时不拦。
 */
export function blueprintOrderSkipError(opts: {
  mode: ProjectWritingMode | undefined;
  blueprint: WritingBlueprint | null | undefined;
  sectionBodies: Record<string, string>;
  sectionKey: string;
  subsectionTitle: string;
  userGoal: string;
}): string | null {
  const next = firstUnfinishedBlueprintPath(opts);
  if (!next) return null;
  if (requestMatchesBlueprintPath(opts.sectionKey, opts.subsectionTitle, next, opts.mode)) {
    return null;
  }
  if (userNamedWriteTarget(opts.userGoal, opts.sectionKey, opts.subsectionTitle, opts.subsectionTitle)) {
    return null;
  }
  const asked = opts.subsectionTitle.trim() || opts.sectionKey;
  return (
    `蓝图下一节是「${next}」。请先写这一节，不要跳到「${asked}」。`
    + "用户点名要写别的节时，目标里需要写出该节名称。"
  );
}

export function pickNextWriteTarget(opts: {
  mode: ProjectWritingMode | undefined;
  blueprint: WritingBlueprint | null | undefined;
  sectionBodies: Record<string, string>;
}): { sectionKey: string; subsectionPath: string } | null {
  const ordered = firstUnfinishedBlueprintPath(opts);
  if (ordered) {
    return {
      sectionKey: mapToSectionForMode(ordered, opts.mode),
      subsectionPath: ordered,
    };
  }
  if (opts.blueprint && opts.blueprint.writingOrder.length > 0) return null;
  for (const key of NEXT_WRITE_SECTION_ORDER) {
    const missing = firstMissingBlueprintSubsection(
      opts.blueprint,
      key,
      opts.mode,
      opts.sectionBodies[key] ?? "",
    );
    if (missing) return { sectionKey: key, subsectionPath: missing };
  }
  return null;
}

export function multiSubsectionWriteError(
  sectionKey: string,
  subsectionTitle: string,
  blueprint: WritingBlueprint | null | undefined,
  mode: ProjectWritingMode | undefined,
): string | null {
  if (subsectionTitle.trim()) return null;
  if (sectionKey !== "literature_body" && sectionKey !== "background") return null;
  const subs = listBlueprintSubsectionPathsForKey(blueprint, sectionKey, mode);
  if (subs.length < 2) return null;
  const label = sectionKey === "background" ? "研究现状" : "综述正文";
  const preview = subs.slice(0, 6).map((p, i) => `${i + 1}. ${p}`).join("；");
  return (
    `${label}请按蓝图子节分批写，不要一次 write_section(${sectionKey}) 写完整章。`
    + `请带 subsectionTitle，例如：${preview}`
    + (subs.length > 6 ? "…" : "")
    + "。每调用一次只写一个子节。"
  );
}

/** 收集本节蓝图 assignedSources（含子路径 guides） */
export function collectBlueprintAssignedSourceTokens(opts: {
  blueprint: WritingBlueprint;
  sectionKey: string;
  mode: ProjectWritingMode | undefined;
  subsectionTitle?: string;
}): string[] {
  const sub = opts.subsectionTitle?.trim();
  let guides = opts.blueprint.sectionGuides.filter(
    (g) => mapToSectionForMode(g.sectionPath, opts.mode) === opts.sectionKey,
  );
  if (sub) {
    const nested = guides.filter(
      (g) => g.sectionPath.includes(sub) || g.sectionPath.endsWith(sub),
    );
    if (nested.length > 0) guides = nested;
  }
  const tokens: string[] = [];
  for (const g of guides) {
    for (const s of g.assignedSources ?? []) {
      const t = s.trim();
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

/**
 * 将蓝图 assignedSources 解析为 RAG selectedSourceIds（文件名）。
 * 支持：PDF/源文件名、`[n]` / `n` → ReferenceSource.sourceName。
 * 解析后为空则返回 undefined（勿传 []，会清空检索）。
 */
export function resolveAssignedSourcesToSelectedIds(
  tokens: string[],
  referenceSourceNames?: { refIndex: number; sourceName: string }[],
): string[] | undefined {
  if (tokens.length === 0) return undefined;
  const byIndex = new Map(
    (referenceSourceNames ?? []).map((r) => [r.refIndex, r.sourceName]),
  );
  const out = new Set<string>();
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^\[?(\d{1,3})\]?$/);
    if (m) {
      const name = byIndex.get(parseInt(m[1], 10));
      if (name?.trim()) out.add(name.trim());
      continue;
    }
    out.add(t);
  }
  if (out.size === 0) return undefined;
  return [...out];
}

export function applyBlueprintSectionHintForKey(
  context: string,
  blueprint: WritingBlueprint | null | undefined,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  sectionPath: string,
): string {
  const base = stripBlueprintSectionHint(context);
  if (!blueprint || !sectionPath.trim()) return base;
  const hint = formatBlueprintSectionHintForKey(
    blueprint,
    sectionKey,
    mode,
    sectionPath,
  );
  if (!hint.trim()) return base;
  return base ? `${base}\n${hint}` : hint.trimEnd();
}

/** 从 Agent 项目快照组装 Writer 用的 WritingGlobalContext（blueprint 必须嵌套） */
export function buildAgentWritingGlobalContext(
  project: AgentProjectSnapshot,
): WritingGlobalContext {
  const prev = project.globalContext;
  const sectionPreviews: Record<string, string> = {
    ...(prev?.sectionPreviews ?? {}),
  };
  for (const s of project.sectionFills) {
    if (s.preview?.trim() && !sectionPreviews[s.key]) {
      const p = s.preview.trim();
      sectionPreviews[s.key] =
        p.length > 150 ? `${p.slice(0, 150)}...` : p;
    }
  }

  return {
    abstract: prev?.abstract,
    outline: project.outline || prev?.outline || undefined,
    sectionPreviews:
      Object.keys(sectionPreviews).length > 0 ? sectionPreviews : undefined,
    sectionBodies: prev?.sectionBodies,
    analysisResults: prev?.analysisResults,
    blueprint: prev?.blueprint ?? null,
  };
}

/**
 * 写前注入：globalContext.blueprint + 本节蓝图 hint → draftContext；
 * 并解析 assignedSources → selectedSourceIds（有分配才限 RAG）。
 */
export function prepareAgentWriteBlueprintContext(opts: {
  project: AgentProjectSnapshot;
  sectionKey: string;
  draftContext: string;
  subsectionTitle?: string;
}): {
  globalContext: WritingGlobalContext;
  draftContext: string;
  selectedSourceIds?: string[];
} {
  const globalContext = buildAgentWritingGlobalContext(opts.project);
  const blueprint = globalContext.blueprint;
  if (!blueprint) {
    return { globalContext, draftContext: opts.draftContext };
  }

  let sectionPath = resolveBlueprintSectionPathForKey(
    opts.sectionKey,
    opts.project.outline,
    opts.project.mode,
    blueprint,
    opts.project.language,
  );

  const sub = opts.subsectionTitle?.trim();
  if (sub) {
    const nested = blueprint.sectionGuides.find(
      (g) =>
        mapToSectionForMode(g.sectionPath, opts.project.mode)
          === opts.sectionKey
        && (g.sectionPath.includes(sub) || g.sectionPath.endsWith(sub)),
    );
    sectionPath = nested?.sectionPath ?? `${sectionPath} > ${sub}`;
  }

  const draftContext = applyBlueprintSectionHintForKey(
    opts.draftContext,
    blueprint,
    opts.sectionKey,
    opts.project.mode,
    sectionPath,
  );

  const selectedSourceIds = resolveAssignedSourcesToSelectedIds(
    collectBlueprintAssignedSourceTokens({
      blueprint,
      sectionKey: opts.sectionKey,
      mode: opts.project.mode,
      subsectionTitle: opts.subsectionTitle,
    }),
    opts.project.referenceSourceNames,
  );

  return { globalContext, draftContext, selectedSourceIds };
}

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
      parts.push(`  · ${g.sectionPath}：${g.purpose}${kp}`);
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

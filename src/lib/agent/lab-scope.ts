/**
 * 实验室固定四方向 ↔ 文献库分类（与 scripts/seed-directions.mjs 对齐）
 * Agent 建议下一步时必须落在此范围内，禁止被单篇外部检索结果带偏改题。
 * 四方向是围栏，不是每篇论文都要扫齐的检索清单。
 */

import type { AgentPlan } from "@/contracts/agent";
import { inferCategoriesFromTitle } from "@/lib/knowledge-category-hints";

export interface LabDirectionScope {
  slug: string;
  name: string;
  categories: readonly string[];
}

export interface LabScopeBlockInput {
  knowledgeCategories?: readonly string[];
  title?: string;
  researchDirection?: string;
  directionSlug?: string;
}

/** 固定四方向（不可由外部文献临时发明第五方向） */
export const LAB_DIRECTIONS: readonly LabDirectionScope[] = [
  {
    slug: "thermochemistry",
    name: "热化学",
    categories: ["热化学"],
  },
  {
    slug: "tobacco",
    name: "烟草",
    categories: ["烟草"],
  },
  {
    slug: "fireworks",
    name: "烟花",
    categories: ["烟花"],
  },
  {
    slug: "light-plants",
    name: "光与植物",
    categories: ["茶学", "控释肥类"],
  },
] as const;

const OFF_TOPIC_SWEEP_RE = /按实验室四方向|四方向检索|对齐分类/;

export function allLabCategoryNames(): string[] {
  const set = new Set<string>();
  for (const d of LAB_DIRECTIONS) {
    for (const c of d.categories) set.add(c);
  }
  return [...set];
}

export function categoriesForDirectionSlug(slug?: string): string[] {
  const key = slug?.trim();
  if (!key) return [];
  const hit = LAB_DIRECTIONS.find(
    (d) => d.slug === key || d.name === key || d.categories.includes(key),
  );
  return hit ? [...hit.categories] : [];
}

function otherLabCategoryNames(allowed: readonly string[]): string[] {
  return allLabCategoryNames().filter((c) => !allowed.includes(c));
}

/** 题名/方向 → 本篇应检索的知识库分类（可空：未锁定时不要扫四方向） */
export function resolveProjectSearchCategories(opts: {
  title?: string;
  researchDirection?: string;
  directionSlug?: string;
}): string[] {
  const fromSlug = categoriesForDirectionSlug(opts.directionSlug);
  if (fromSlug.length > 0) return fromSlug;

  const inferred = inferCategoriesFromTitle(opts.title, opts.researchDirection);
  if (inferred.length === 1) return inferred;

  const blob = `${opts.researchDirection ?? ""} ${opts.title ?? ""}`.trim();
  if (blob) {
    for (const d of LAB_DIRECTIONS) {
      if (blob.includes(d.name) || new RegExp(`\\b${d.slug}\\b`, "i").test(blob)) {
        return [...d.categories];
      }
    }
  }

  if (inferred.length > 1) {
    const thermo = inferred.includes("热化学");
    const tea = inferred.includes("茶学");
    if (thermo && tea && !/茶|tea/i.test(`${opts.title ?? ""} ${opts.researchDirection ?? ""}`)) {
      return inferred.filter((c) => c !== "茶学");
    }
  }
  return inferred;
}

/** 命中片段是否属于实验室其它方向（相对本篇允许分类） */
export function isOffTopicLabCategory(
  chunkCategory: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!chunkCategory || allowed.length === 0) return false;
  if (chunkCategory === "外部摘要") return false;
  if (allowed.includes(chunkCategory)) return false;
  return allLabCategoryNames().includes(chunkCategory);
}

function mentionsDisallowedLabCategory(text: string, allowed: readonly string[]): boolean {
  if (OFF_TOPIC_SWEEP_RE.test(text)) return true;
  return otherLabCategoryNames(allowed).some((c) => text.includes(c));
}

/** 规划器仍写出「按四方向检索」时，按当前题目改掉标题 */
export function sanitizePlanAgainstLabScope(
  plan: AgentPlan,
  allowedCategories: readonly string[],
): AgentPlan {
  if (allowedCategories.length === 0) return plan;
  const allowed = allowedCategories.join("、");
  const subtasks = plan.subtasks.map((s) => {
    const title = s.title ?? "";
    if (!mentionsDisallowedLabCategory(title, allowedCategories)) return s;
    return {
      ...s,
      title: title.includes("导入")
        ? `分批导入本题相关文献（仅 ${allowed}，禁止其它实验室方向）`
        : `仅在「${allowed}」检索本题缺口文献，禁止扫其它实验室方向`,
    };
  });
  return { ...plan, subtasks };
}

/** 注入系统提示 / 项目简报：实验室范围 */
export function formatLabScopeBlock(input: LabScopeBlockInput = {}): string {
  const searchCats = resolveProjectSearchCategories(input);
  const otherDirs = LAB_DIRECTIONS
    .filter((d) => !d.categories.some((c) => searchCats.includes(c)))
    .map((d) => d.name);

  const locked =
    searchCats.length > 0
      ? [
          `当前论文方向已锁定，检索/导入/文献分类只允许：${searchCats.join("、")}`,
          otherDirs.length > 0
            ? `实验室其它方向（${otherDirs.join("、")}）与本题无关：禁止写进子任务、禁止 search_knowledge 换分类、禁止当参考文献分类标签。`
            : "",
        ]
      : [
          "当前检索分类尚未从题目锁定。只按用户目标与题名词检索。",
          `实验室方向仅有：${LAB_DIRECTIONS.map((d) => d.name).join("、")}。这是禁止改题的围栏，不是检索覆盖清单。`,
        ];

  return [
    "【实验室范围 — 硬约束】",
    ...locked.filter(Boolean),
    "规则：",
    "1. 禁止规划「按实验室四方向检索」，禁止为凑覆盖去搜与本题无关的方向。",
    "2. search_knowledge 必须带当前允许的 category；不要泛搜无关领域。",
    "3. search_external 命中若与项目题目无关：只说明不匹配，禁止据此改题。",
    "4. 离题已导入文献可当误导入或方法模板，不要把论文题目改成该文献主题。",
    "5. 下一步必须服务当前项目标题，不要输出换赛道路线。",
  ].join("\n");
}

/**
 * 实验室固定四方向 ↔ 文献库分类（与 scripts/seed-directions.mjs 对齐）
 * Agent 建议下一步时必须落在此范围内，禁止被单篇外部检索结果带偏改题。
 */

export interface LabDirectionScope {
  slug: string;
  name: string;
  categories: readonly string[];
}

/** 固定四方向（不可由外部文献临时发明第五方向） */
export const LAB_DIRECTIONS: readonly LabDirectionScope[] = [
  {
    slug: "thermochemistry",
    name: "热化学",
    categories: ["热化学", "热解"],
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

export function allLabCategoryNames(): string[] {
  const set = new Set<string>();
  for (const d of LAB_DIRECTIONS) {
    for (const c of d.categories) set.add(c);
  }
  return [...set];
}

/** 注入系统提示 / 项目简报：实验室范围 */
export function formatLabScopeBlock(knowledgeCategories?: readonly string[]): string {
  const dirLines = LAB_DIRECTIONS.map(
    (d) => `- ${d.name}（${d.slug}）→ 文献分类：${d.categories.join("、")}`,
  ).join("\n");

  const catLine =
    knowledgeCategories && knowledgeCategories.length > 0
      ? `当前文献库分类：${knowledgeCategories.join("、")}`
      : `文献库分类（约定）：${allLabCategoryNames().join("、")}`;

  return [
    "【实验室范围 — 硬约束】",
    "本实验室仅有四个研究方向，选题与下一步建议必须落在其中（或用户已填的研究题目/researchDirection），禁止发明第五方向：",
    dirLines,
    catLine,
    "规则：",
    "1. 优先 search_knowledge，并用 category 限定到上表分类；不要一上来就泛搜外部「通用 AI/具身智能」等无关领域。",
    "2. search_external 命中若与项目题目/四方向无关：只能说明「不匹配实验室方向」，禁止据此提出「改写某领域综述」「路线：写 XXX」类改题建议。",
    "3. 单篇已导入文献若离题：当作误导入或仅作方法模板参考，不要把整篇论文题目改成该文献主题。",
    "4. 给用户的 1～3 个下一步，必须服务当前项目标题与四方向之一，不要输出「路线 A/B 换赛道」。",
  ].join("\n");
}

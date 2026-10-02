/**
 * 题名 / 方向 / 摘要 → 实验室知识库分类提示（写作检索与外部入库共用）
 */

export const EXTERNAL_ABSTRACT_CATEGORY = "外部摘要";

/** 实验室口语/别名 → 磁盘 `index_<分类>.json` 实名。搜「热解」不能去读不存在的 index_热解.json。 */
export const RAG_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  热解: "热化学",
};

export function resolveRagCategoryName(category: string | undefined | null): string | undefined {
  if (category == null) return undefined;
  const t = category.trim();
  if (!t) return undefined;
  if (t === "全部") return t;
  return RAG_CATEGORY_ALIASES[t] ?? t;
}

/**
 * 题目/方向 → 知识库分类提示。
 * 禁止用「挥发性 / 香气 / coating / curing / 肥料」这种跨领域词当分类开关：
 * 热解气也有挥发性产物，碳包覆也叫 coating，会把热化学综述扫进茶学/控释肥。
 */
export const TITLE_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  {
    pattern:
      /热解|共热解|热化学|裂解|气化|合成气|生物油|碳纳米|秸秆.*热解|营养元素.*迁移|生物炭|pyrolysis|pyrolytic|torrefaction|gasification|biochar/i,
    category: "热化学",
  },
  { pattern: /烟花|烟火|推进剂|含能|火药|燃烧剂|高氯酸|firework|propellant/i, category: "烟花" },
  { pattern: /烤烟|烟草|烟叶|植烟|卷烟|tobacco/i, category: "烟草" },
  {
    pattern: /控释肥|缓释肥|包膜肥|包衣肥|氮素淋|生物炭基肥|controlled.?release\s*fertilizer/i,
    category: "控释肥类",
  },
  {
    pattern:
      /绿茶|红茶|乌龙|普洱|白茶|黄茶|茶叶|茶树|茶学|茶汤|茶多酚|杀青|摊放|catechins|\btea\b/i,
    category: "茶学",
  },
];

/**
 * 从标题/方向/摘要推断可能相关的知识库分类。
 */
export function inferCategoriesFromTitle(...texts: Array<string | undefined>): string[] {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob.trim()) return [];
  const cats = new Set<string>();
  for (const { pattern, category } of TITLE_CATEGORY_HINTS) {
    if (pattern.test(blob)) cats.add(category);
  }
  return Array.from(cats);
}

export function inferCategoriesFromQuery(query: string): string[] {
  return inferCategoriesFromTitle(query);
}

/** 取第一个命中分类（入库自动归类用） */
export function inferPrimaryCategoryFromText(...texts: Array<string | undefined>): string | null {
  return inferCategoriesFromTitle(...texts)[0] ?? null;
}

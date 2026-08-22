/**
 * 题名 / 方向 / 摘要 → 实验室知识库分类提示（写作检索与外部入库共用）
 */

export const EXTERNAL_ABSTRACT_CATEGORY = "外部摘要";

/** 题目/方向 → 知识库分类提示 */
export const TITLE_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /茶|绿茶|红茶|乌龙|普洱|香气|挥发性|杀青|摊放|茶汤/, category: "茶学" },
  { pattern: /烟花|烟火|推进剂|含能|火药|燃烧剂|高氯酸/, category: "烟花" },
  { pattern: /烤烟|烟草|烟叶|植烟|卷烟/, category: "烟草" },
  {
    pattern:
      /热解|共热解|热化学|裂解|pyrolysis|pyrolytic|torrefaction|生物质.*塑料|碳纳米|秸秆.*热解|营养元素.*迁移|生物炭|biochar/i,
    category: "热化学",
  },
  { pattern: /控释|缓释|包衣|包膜|肥料|氮素淋|生物炭基肥/, category: "控释肥类" },
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

/** 取第一个命中分类（入库自动归类用） */
export function inferPrimaryCategoryFromText(...texts: Array<string | undefined>): string | null {
  return inferCategoriesFromTitle(...texts)[0] ?? null;
}

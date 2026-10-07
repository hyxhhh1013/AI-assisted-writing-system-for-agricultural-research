import path from "path";

/** 扩写 query 里自带的章节套话，不当成连续词组 */
const CJK_PHRASE_STOP = new Set([
  "研究背景",
  "研究现状",
  "研究进展",
  "研究目的",
  "研究脉络",
  "研究空白",
  "研究分布",
  "文献综合",
  "文献不足",
  "文献综述",
  "实验方法",
  "实验数据",
  "结果分析",
  "主要结果",
  "主要结论",
  "主要问题",
  "综合结论",
  "未来方向",
  "应用前景",
  "存在问题",
  "结构安排",
  "概念框架",
  "性能对比",
  "影响因素",
]);

/** 查询里最长的连续中文（4～18 字），去掉章节套话。 */
export function extractCjkPhrases(query: string, max = 4): string[] {
  const runs = query.match(/[\u4e00-\u9fff]{4,18}/g) ?? [];
  const uniq: string[] = [];
  for (const run of runs) {
    if (CJK_PHRASE_STOP.has(run) || uniq.includes(run)) continue;
    uniq.push(run);
  }
  uniq.sort((a, b) => b.length - a.length);
  return uniq.slice(0, max);
}

export function cjkPhraseHits(text: string, phrases: string[]): number {
  if (!text || phrases.length === 0) return 0;
  let n = 0;
  for (const phrase of phrases) {
    if (text.includes(phrase)) n += 1;
  }
  return n;
}

export function paperKeyFromSource(source: string): string {
  const base = path.basename((source || "unknown").replace(/\\/g, "/"));
  return base || "unknown";
}

/**
 * 篇级分：连续词组落在题名/正文的权重大于单块 BM25，
 * 年份和被引只作很小的乘数，避免压过相关度。
 */
export function paperPriority(
  bestScore: number,
  signals?: {
    titlePhraseHits?: number;
    bodyPhraseHits?: number;
    year?: number;
    citedBy?: number;
    impactFactor?: number;
  },
): number {
  const titleHits = signals?.titlePhraseHits ?? 0;
  const bodyHits = signals?.bodyPhraseHits ?? 0;
  const score = bestScore * 0.35 + titleHits * 6 + bodyHits * 3;
  let mul = 1;
  const year = signals?.year;
  if (year && year >= 2018) mul += 0.06;
  else if (year && year >= 2012) mul += 0.03;
  const cited = signals?.citedBy;
  if (cited && cited >= 100) mul += 0.08;
  else if (cited && cited >= 20) mul += 0.04;
  const impact = signals?.impactFactor;
  if (impact && impact >= 5) mul += 0.04;
  return score * mul;
}

/** 先按篇保留 paperLimit 篇，再按原块顺序留下这些篇的片段。 */
export function restrictOrderToTopPapers(args: {
  order: number[];
  sources: string[];
  scores: number[];
  paperLimit: number;
  titlePhraseHits?: number[];
  bodyPhraseHits?: number[];
  year?: Array<number | undefined>;
  citedBy?: Array<number | undefined>;
  impactFactor?: Array<number | undefined>;
}): number[] {
  const { order, paperLimit } = args;
  if (paperLimit <= 0 || order.length === 0) return order;

  type Acc = {
    score: number;
    titleHits: number;
    bodyHits: number;
    year?: number;
    cited?: number;
    impact?: number;
  };
  const best = new Map<string, Acc>();
  for (const i of order) {
    const key = paperKeyFromSource(args.sources[i] || "");
    const acc = best.get(key) ?? { score: 0, titleHits: 0, bodyHits: 0 };
    acc.score = Math.max(acc.score, args.scores[i] ?? 0);
    acc.titleHits = Math.max(acc.titleHits, args.titlePhraseHits?.[i] ?? 0);
    acc.bodyHits = Math.max(acc.bodyHits, args.bodyPhraseHits?.[i] ?? 0);
    if (args.year?.[i] != null) acc.year = args.year[i];
    if (args.citedBy?.[i] != null) acc.cited = args.citedBy[i];
    if (args.impactFactor?.[i] != null) acc.impact = args.impactFactor[i];
    best.set(key, acc);
  }

  const ranked = [...best.entries()].sort((a, b) => {
    const pb = paperPriority(b[1].score, {
      titlePhraseHits: b[1].titleHits,
      bodyPhraseHits: b[1].bodyHits,
      year: b[1].year,
      citedBy: b[1].cited,
      impactFactor: b[1].impact,
    });
    const pa = paperPriority(a[1].score, {
      titlePhraseHits: a[1].titleHits,
      bodyPhraseHits: a[1].bodyHits,
      year: a[1].year,
      citedBy: a[1].cited,
      impactFactor: a[1].impact,
    });
    return pb - pa;
  });
  const keep = new Set(ranked.slice(0, paperLimit).map(([key]) => key));
  const filtered = order.filter((i) => keep.has(paperKeyFromSource(args.sources[i] || "")));
  return filtered.length > 0 ? filtered : order;
}

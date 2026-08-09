/**
 * 配图识图质检：两级标准
 * - regen：草稿硬伤，必须 replaceImageUrl 重画
 * - polish：可接受但建议 /plot 精修（不强制重画）
 * - pass：通过
 */

export type FigureQaVerdict = "pass" | "polish" | "regen";

export interface FigureQaParseResult {
  verdict: FigureQaVerdict;
  needsRegen: boolean;
  needsPolish: boolean;
}

/** Agent 自检机理图/流程图：硬伤重画 + 期刊建议精修 */
export const FIGURE_QA_PROMPT =
  "你是论文机理图/配图质检助手（两级标准）。用中文按条目检查（没有就写「无」）：\n"
  + "\n"
  + "【草稿硬伤 → 结论必须写「需重生成」】\n"
  + "1. 占位/空栏：Upload figure asset、虚线空框、空白面板、某栏几乎无内容\n"
  + "2. 英文模板节点：Pathway/Product/Feedstock/Support/Conversion 等通用英文占位\n"
  + "3. 文字严重重复：同一整句在节点与脚注/总结框中重复出现\n"
  + "4. 结构过简：自称框架/机理/综述却仅为无分支单列清单（≤3 节点且无并行边）\n"
  + "5. 节点文案过载：多数节点为长段落（单节点约超过 28 个汉字，或完整句子堆砌），难以作图注式短语阅读\n"
  + "6. 多栏严重失衡：三栏图中某栏节点数与其他栏相差 ≥3，或一栏明显空心\n"
  + "\n"
  + "【期刊观感 → 结论写「可接受·建议精修」（不要写需重生成）】\n"
  + "7. 轻微不对称、个别节点略长但仍可读\n"
  + "8. 缺少量分叉边、箭头逻辑可再澄清\n"
  + "9. 字号/对齐/留白/配色等观感问题（应引导用户去绘图页精修）\n"
  + "\n"
  + "【通过】无硬伤且结构清楚、节点多为短语级 → 「可接受」\n"
  + "\n"
  + "最后一行只写三选一（勿写其它变体）：\n"
  + "结论：需重生成\n"
  + "结论：可接受·建议精修\n"
  + "结论：可接受\n"
  + "不要编造图中没有的内容。";

const HARD_FAIL_SIGNAL =
  /Upload figure asset|Pathway\s*\d|Feedstock|结论\s*[:：]\s*需重生成/i;

const POLISH_SIGNAL =
  /结论\s*[:：]\s*可接受\s*[·・\-–—]?\s*建议精修|结论\s*[:：]\s*建议精修/i;

const PASS_SIGNAL = /结论\s*[:：]\s*可接受(?!\s*[·・\-–—]?\s*建议精修)/i;

/** 从视觉模型质检正文解析两级结论 */
export function parseFigureQaVerdict(text: string): FigureQaParseResult {
  const t = text.trim();
  if (!t) {
    return { verdict: "polish", needsRegen: false, needsPolish: true };
  }
  if (HARD_FAIL_SIGNAL.test(t)) {
    return { verdict: "regen", needsRegen: true, needsPolish: false };
  }
  if (POLISH_SIGNAL.test(t)) {
    return { verdict: "polish", needsRegen: false, needsPolish: true };
  }
  if (PASS_SIGNAL.test(t)) {
    return { verdict: "pass", needsRegen: false, needsPolish: false };
  }
  // 未给出规范结论：不强制重画，但标建议精修，避免灰区一律放行
  return { verdict: "polish", needsRegen: false, needsPolish: true };
}

export function buildFigureQaPolishNudge(imageUrl?: string): string {
  const hrefHint = imageUrl
    ? `（图 ${imageUrl}；配图坞「绘图页精修」）`
    : "（配图坞「绘图页精修」）";
  return (
    "System: 识图质检为「可接受·建议精修」——草稿硬伤已过，但期刊观感仍可改进。"
    + "不必强制 replace 重画；向用户说明可去绘图页精修"
    + hrefHint
    + "，或按用户明确要求再带 replaceImageUrl 小改。"
  );
}

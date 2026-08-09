import {
  FIGURE_REVISE_ASPECT_LABELS,
  type FigureReviseFormValue,
  type FigureReviseTarget,
} from "@/contracts/figure-revise";

/** 结果卡：正文落点说明（节末策略） */
export function formatFigurePlacementHint(input: {
  sectionKey?: string;
  insertMode?: string;
  sectionLabel?: string;
}): string {
  const sec = input.sectionLabel || input.sectionKey;
  if (!sec) return "尚未写入正文（仅图表库）；需要时可指定 sectionKey 插入节末";
  const mode =
    input.insertMode === "replaced"
      ? "已就地替换"
      : input.insertMode === "appended"
        ? "已追加到节末"
        : "已关联章节";
  return `${mode}「${sec}」· 当前策略为节末落盘，可稍后在编辑器插图条挪位置`;
}

/** 由表单拼出发给 Agent 的改图指令（强制 replace） */
export function buildFigureReviseGoal(
  target: FigureReviseTarget,
  form: FigureReviseFormValue,
): string {
  const replaceUrl = target.replaceImageUrl || target.imageUrl;
  const titleBit = target.title ? `「${target.title}」` : "";
  const aspectBits = form.aspects.map((a) => FIGURE_REVISE_ASPECT_LABELS[a]);
  const lines: string[] = [
    `请按结构化意见改图${titleBit}（Agent 草稿小改；复杂观感可稍后去绘图页）。`,
  ];
  if (aspectBits.length) {
    lines.push(`改动点：${aspectBits.join("、")}。`);
  }
  if (form.aspects.includes("fork")) {
    lines.push("请用 layout=fork 或 nodesJson+edgesJson 做出分叉汇合，避免单链过简。");
  }
  if (form.aspects.includes("template") && form.templateId) {
    lines.push(`可传 templateId="${form.templateId}"（参数可覆盖模板）。`);
  }
  if (form.aspects.includes("color") && form.colorPreset) {
    lines.push(`配色倾向 preset=${form.colorPreset}（若工具支持则带上）。`);
  }
  if (form.note.trim()) {
    lines.push(`补充说明：${form.note.trim()}`);
  }
  if (!aspectBits.length && !form.note.trim()) {
    lines.push("请根据上一轮 QA/常识略作结构优化（至少增加合理分叉或澄清节点文案）。");
  }
  lines.push(
    `必须调用 draft_mechanism_figure 或 generate_chart，并传 replaceImageUrl="${replaceUrl}" 就地替换；`,
  );
  lines.push(
    "只改 nodesJson/edgesJson/panelsJson/flowSteps/templateId，禁止无 replace 再 append，不要整章重插。",
  );
  if (target.sectionKey) {
    lines.push(`sectionKey 保持为 ${target.sectionKey}（节末落盘策略，无需改插入位置）。`);
  }
  return lines.join("\n");
}

import type { SoftReferenceEvidence } from "@/contracts/project";

/** 题录里 Elsevier 页眉会把真正题目冲掉 */
export function cleanBibliographyTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^\[\d+\]\s*/, "");
  t = t.replace(/Contents lists available at[\s\S]*$/i, "");
  t = t.replace(/j\s*o\s*u\s*r\s*n\s*a\s*l[\s\S]*h\s*o\s*m\s*e[\s\S]*$/i, "");
  t = t.replace(/Available online at[\s\S]*$/i, "");
  t = t.replace(/\.pdf$/i, "");
  return t.slice(0, 180).trim();
}

export function formatProjectBibliographyBlock(input: {
  references?: string[];
  evidence?: SoftReferenceEvidence[];
  max?: number;
  withAbstract?: boolean;
}): string {
  const max = input.max ?? 40;
  const byN = new Map<number, { title: string; abstract?: string }>();

  (input.references ?? []).forEach((line, i) => {
    const n = i + 1;
    const title = cleanBibliographyTitle(line);
    if (title.length >= 8) byN.set(n, { title });
  });
  for (const ev of input.evidence ?? []) {
    if (!Number.isInteger(ev.index) || ev.index < 1) continue;
    const title = cleanBibliographyTitle(ev.title || byN.get(ev.index)?.title || "");
    const abstract = ev.abstract?.replace(/\s+/g, " ").trim();
    if (title.length < 8 && !(abstract && abstract.length >= 40)) continue;
    byN.set(ev.index, {
      title: title || `文献 [${ev.index}]`,
      abstract: abstract || undefined,
    });
  }

  const rows = [...byN.entries()].sort((a, b) => a[0] - b[0]).slice(0, max);
  if (rows.length === 0) return "";

  const lines = rows.map(([n, row]) => {
    const abs =
      input.withAbstract && row.abstract
        ? ` — ${row.abstract.slice(0, 140)}`
        : "";
    return `[${n}] ${row.title}${abs}`;
  });
  return (
    `【项目参考文献】共 ${byN.size} 篇。子节要点与正文点名的作者/年份必须出自本表；`
    + `禁止点名表外论文（即使知识库摘录里出现过）。引用 [n] 必须与该条题录主题相符，不得把靠前编号当通用综述。\n`
    + lines.join("\n")
  );
}

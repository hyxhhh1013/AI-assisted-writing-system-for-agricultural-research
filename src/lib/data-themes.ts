import type { DataSourceAnalysis } from "@/contracts/data-source";

/**
 * 把已入库的多份文件收成「同一种测量」的主题建议。
 * 只读预览和列名，不改 dataSources。至少两份文件对得上才成主题。
 */

export interface DataThemeMember {
  fileName: string;
  file: string;
  sample: string;
  label: string;
}

export interface DataThemeProposal {
  id: string;
  title: string;
  kind: "curves" | "scalars" | "peaks";
  members: DataThemeMember[];
  /** 对得上的表头或关键词，给窗口里看 */
  evidence: string;
}

export interface DataThemeUnassigned {
  fileName: string;
  file: string;
  label: string;
  reason: string;
}

export interface DataThemeReport {
  themes: DataThemeProposal[];
  unassigned: DataThemeUnassigned[];
}

interface Family {
  id: string;
  title: string;
  kind: DataThemeProposal["kind"];
  /** 命中其一即可 */
  tokens: RegExp[];
}

const FAMILIES: Family[] = [
  {
    id: "pore-isotherm",
    title: "孔结构等温线",
    kind: "curves",
    tokens: [/相对压力/, /p\s*\/\s*p0/i, /p\s*\/\s*po/i, /harkins/i, /吸附层/],
  },
  {
    id: "pore-scalar",
    title: "孔结构",
    kind: "scalars",
    tokens: [/\bbet\b/i, /比表面/, /孔容/, /孔径/, /pore volume/i, /pore size/i],
  },
  {
    id: "xrd",
    title: "XRD",
    kind: "peaks",
    tokens: [/2\s*θ/, /2theta/i, /two[_\s-]?theta/i, /衍射角/, /\bxrd\b/i],
  },
  {
    id: "ftir",
    title: "FT-IR",
    kind: "curves",
    tokens: [/波数/, /wavenumber/i, /cm-1/i, /cm⁻¹/, /ft-?ir/i],
  },
  {
    id: "xps",
    title: "XPS",
    kind: "curves",
    tokens: [/binding energy/i, /结合能/, /counts\s*\/\s*s/i],
  },
];

function splitStoredName(fileName: string): { file: string; label: string } {
  const mark = fileName.indexOf(" · ");
  if (mark === -1) return { file: fileName, label: "整表" };
  const label = fileName.slice(mark + 3).trim();
  return { file: fileName.slice(0, mark).trim(), label: label || "未命名" };
}

function sampleOf(file: string): string {
  return file.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
}

function sourceText(source: DataSourceAnalysis): string {
  const cells = [
    source.fileName,
    ...(source.previewHeaders ?? []),
    ...source.columns.map((column) => column.name),
    ...(source.preview ?? []).flat(),
    ...(source.chartConfigs ?? []).map((chart) => `${chart.title} ${chart.xLabel ?? ""} ${chart.yLabel ?? ""}`),
  ];
  return cells.join("\n");
}

function matchedFamily(text: string): Family | null {
  for (const family of FAMILIES) {
    if (family.tokens.some((token) => token.test(text))) return family;
  }
  return null;
}

function evidenceOf(family: Family, text: string): string {
  const hit = family.tokens.find((token) => token.test(text));
  if (!hit) return family.title;
  const found = text.match(hit);
  return (found?.[0] ?? family.title).slice(0, 40);
}

export function proposeDataThemes(sources: DataSourceAnalysis[]): DataThemeReport {
  const buckets = new Map<string, { family: Family; members: DataThemeMember[]; evidence: string }>();
  const matchedFiles = new Set<string>();

  for (const source of sources) {
    const text = sourceText(source);
    const family = matchedFamily(text);
    if (!family) continue;
    const { file, label } = splitStoredName(source.fileName);
    const bucket = buckets.get(family.id) ?? { family, members: [], evidence: evidenceOf(family, text) };
    bucket.members.push({
      fileName: source.fileName,
      file,
      sample: sampleOf(file),
      label,
    });
    buckets.set(family.id, bucket);
    matchedFiles.add(source.fileName);
  }

  const themes: DataThemeProposal[] = [];
  const lone: DataThemeUnassigned[] = [];
  for (const bucket of buckets.values()) {
    const files = new Set(bucket.members.map((member) => member.file));
    if (files.size < 2) {
      for (const member of bucket.members) {
        lone.push({
          fileName: member.fileName,
          file: member.file,
          label: member.label,
          reason: `只有这一份像${bucket.family.title}，先不并成主题`,
        });
      }
      continue;
    }
    themes.push({
      id: bucket.family.id,
      title: bucket.family.title,
      kind: bucket.family.kind,
      members: bucket.members,
      evidence: bucket.evidence,
    });
  }
  themes.sort((a, b) => b.members.length - a.members.length || a.title.localeCompare(b.title, "zh"));

  const themed = new Set(themes.flatMap((theme) => theme.members.map((member) => member.fileName)));
  const unassigned: DataThemeUnassigned[] = [...lone];
  for (const source of sources) {
    if (themed.has(source.fileName) || unassigned.some((item) => item.fileName === source.fileName)) continue;
    const { file, label } = splitStoredName(source.fileName);
    unassigned.push({
      fileName: source.fileName,
      file,
      label,
      reason: "没有和其他文件对上的同类表头",
    });
  }

  return { themes, unassigned };
}

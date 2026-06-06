import type { JournalMetrics, KnowledgeBib } from "@/contracts/knowledge";

/** 归一化 ISSN 用于匹配（去连字符、空格，大写） */
export function normalizeIssn(issn: string): string {
  return issn.replace(/[-\s]/g, "").toUpperCase();
}

export function parseMetricsJson(raw: string | null | undefined): JournalMetrics | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as JournalMetrics;
  } catch {
    return null;
  }
}

export function serializeMetrics(metrics: JournalMetrics | null | undefined): string | null {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  return JSON.stringify(metrics);
}

/** 从书目取可匹配的 ISSN 列表（已归一化） */
export function collectIssnKeys(bib: KnowledgeBib | null | undefined): string[] {
  if (!bib) return [];
  const keys: string[] = [];
  for (const raw of [bib.issn, bib.eissn]) {
    if (!raw?.trim()) continue;
    const n = normalizeIssn(raw);
    if (n && !keys.includes(n)) keys.push(n);
  }
  return keys;
}

const CSV_HEADERS = [
  "issn",
  "impactfactor",
  "impactfactoryear",
  "jcrquartile",
  "caspartition",
  "iscorejournal",
] as const;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseBoolCell(value: string | undefined): boolean | undefined {
  if (!value?.trim()) return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "是"].includes(v)) return true;
  if (["0", "false", "no", "n", "否"].includes(v)) return false;
  return undefined;
}

/** 解析实验室期刊指标 CSV → ISSN → JournalMetrics */
export function parseJournalMetricsCsv(text: string): Map<string, JournalMetrics> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return new Map();

  const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const colIndex = (name: (typeof CSV_HEADERS)[number]): number => headerCells.indexOf(name);

  const issnIdx = colIndex("issn");
  if (issnIdx < 0) {
    throw new Error("CSV 缺少 issn 列");
  }

  const ifIdx = colIndex("impactfactor");
  const yearIdx = colIndex("impactfactoryear");
  const qIdx = colIndex("jcrquartile");
  const casIdx = colIndex("caspartition");
  const coreIdx = colIndex("iscorejournal");

  const map = new Map<string, JournalMetrics>();

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const issnRaw = cells[issnIdx];
    if (!issnRaw) continue;
    const key = normalizeIssn(issnRaw);
    if (!key) continue;

    const ifRaw = ifIdx >= 0 ? cells[ifIdx] : undefined;
    const impactFactor = ifRaw?.trim() ? Number(ifRaw) : undefined;
    const yearRaw = yearIdx >= 0 ? cells[yearIdx] : undefined;
    const impactFactorYear = yearRaw?.trim() ? Number(yearRaw) : undefined;

    map.set(key, {
      impactFactor: Number.isFinite(impactFactor) ? impactFactor : undefined,
      impactFactorYear: Number.isFinite(impactFactorYear) ? impactFactorYear : undefined,
      jcrQuartile: qIdx >= 0 ? cells[qIdx]?.trim() || undefined : undefined,
      casPartition: casIdx >= 0 ? cells[casIdx]?.trim() || undefined : undefined,
      isCoreJournal: coreIdx >= 0 ? parseBoolCell(cells[coreIdx]) : undefined,
    });
  }

  return map;
}

/** 合并指标：CSV 优先保留 IF/分区，OpenAlex 补 citedBy / OA */
export function mergeJournalMetrics(
  existing: JournalMetrics | null | undefined,
  incoming: JournalMetrics,
): JournalMetrics {
  return {
    ...existing,
    ...incoming,
    impactFactor: incoming.impactFactor ?? existing?.impactFactor,
    impactFactorYear: incoming.impactFactorYear ?? existing?.impactFactorYear,
    jcrQuartile: incoming.jcrQuartile ?? existing?.jcrQuartile,
    casPartition: incoming.casPartition ?? existing?.casPartition,
    isCoreJournal: incoming.isCoreJournal ?? existing?.isCoreJournal,
    citedByCount: incoming.citedByCount ?? existing?.citedByCount,
    openAccessUrl: incoming.openAccessUrl ?? existing?.openAccessUrl,
  };
}

export interface ApplyJournalMetricsResult {
  matched: number;
  updated: number;
  skipped: number;
}

export function lookupMetricsForBib(
  bib: KnowledgeBib | null | undefined,
  lookup: Map<string, JournalMetrics>,
): JournalMetrics | null {
  for (const key of collectIssnKeys(bib)) {
    const m = lookup.get(key);
    if (m) return m;
  }
  return null;
}

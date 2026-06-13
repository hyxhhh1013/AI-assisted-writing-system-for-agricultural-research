import type { JournalMetrics, KnowledgeBib } from "@/contracts/knowledge";



/** 归一化 ISSN 用于匹配（去连字符、空格，大写） */

export function normalizeIssn(issn: string): string {
  return issn.replace(/[-\s]/g, "").toUpperCase();
}

/** OpenAlex sources API 需 XXXX-XXXX 格式 */
export function formatIssnForOpenAlex(issn: string): string {
  const n = normalizeIssn(issn);
  if (n.length === 8) return `${n.slice(0, 4)}-${n.slice(4)}`;
  return issn.trim();
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



const CANONICAL_HEADERS = [

  "issn",

  "journal",

  "impactfactor",

  "impactfactoryear",

  "jcrquartile",

  "caspartition",

  "iscorejournal",

] as const;



type CanonicalHeader = (typeof CANONICAL_HEADERS)[number];



/** 表头别名（中英文常见列名 → 标准列） */

const HEADER_ALIASES: Record<CanonicalHeader, string[]> = {

  issn: ["issn", "eissn", "issn号", "刊号", "国际标准刊号", "printissn"],

  journal: ["journal", "journalname", "期刊", "刊名", "杂志", "期刊名称", "刊物", "source"],

  impactfactor: ["impactfactor", "if", "impact_factor", "影响因子", "因子", "jcrif"],

  impactfactoryear: ["impactfactoryear", "ifyear", "year", "年份", "数据年份", "if年"],

  jcrquartile: ["jcrquartile", "quartile", "jcr分区", "分区", "jcr", "jcrq", "wos分区"],

  caspartition: ["caspartition", "中科院", "中科院分区", "cas", "cas分区", "大类分区"],

  iscorejournal: ["iscorejournal", "北大核心", "核心刊", "核心期刊", "iscore", "pku核心"],

};



export interface JournalMetricsLookup {

  byIssn: Map<string, JournalMetrics>;

  byJournal: Map<string, JournalMetrics>;

}



/** 归一化期刊名用于 CSV 按刊名匹配 */

export function normalizeJournalKey(name: string): string {

  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

}



/** 从 bib.journal 取刊名主标题（逗号前） */

export function journalKeyFromBib(bib: KnowledgeBib | null | undefined): string | null {

  const raw = bib?.journal?.trim();

  if (!raw) return null;

  const comma = raw.indexOf(",");

  const head = comma > 0 ? raw.slice(0, comma).trim() : raw;

  const key = normalizeJournalKey(head);

  return key || null;

}



function normalizeHeaderToken(raw: string): string {

  return raw.toLowerCase().replace(/[\s_\-]/g, "");

}



function canonicalizeHeader(raw: string): CanonicalHeader | null {

  const token = normalizeHeaderToken(raw);

  if (!token) return null;

  for (const canonical of CANONICAL_HEADERS) {

    if (token === canonical) return canonical;

  }

  for (const canonical of CANONICAL_HEADERS) {

    if (HEADER_ALIASES[canonical].some((alias) => normalizeHeaderToken(alias) === token)) {

      return canonical;

    }

  }

  return null;

}



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



function cellString(value: unknown): string {

  if (value == null) return "";

  return String(value).trim();

}



function buildColumnIndex(headerRow: string[]): (name: CanonicalHeader) => number {

  const indexByCanonical = new Map<CanonicalHeader, number>();

  headerRow.forEach((raw, idx) => {

    const canonical = canonicalizeHeader(raw);

    if (canonical && !indexByCanonical.has(canonical)) {

      indexByCanonical.set(canonical, idx);

    }

  });

  return (name: CanonicalHeader) => indexByCanonical.get(name) ?? -1;

}



function parseMetricsCells(

  cells: string[],

  colIndex: (name: CanonicalHeader) => number,

): JournalMetrics {

  const ifIdx = colIndex("impactfactor");

  const yearIdx = colIndex("impactfactoryear");

  const qIdx = colIndex("jcrquartile");

  const casIdx = colIndex("caspartition");

  const coreIdx = colIndex("iscorejournal");

  const ifRaw = ifIdx >= 0 ? cells[ifIdx] : undefined;

  const impactFactor = ifRaw?.trim() ? Number(ifRaw) : undefined;

  const yearRaw = yearIdx >= 0 ? cells[yearIdx] : undefined;

  const impactFactorYear = yearRaw?.trim() ? Number(yearRaw) : undefined;

  return {

    impactFactor: Number.isFinite(impactFactor) ? impactFactor : undefined,

    impactFactorYear: Number.isFinite(impactFactorYear) ? impactFactorYear : undefined,

    jcrQuartile: qIdx >= 0 ? cells[qIdx]?.trim() || undefined : undefined,

    casPartition: casIdx >= 0 ? cells[casIdx]?.trim() || undefined : undefined,

    isCoreJournal: coreIdx >= 0 ? parseBoolCell(cells[coreIdx]) : undefined,

  };

}



/** 从二维表（首行为表头）解析期刊指标 */

export function parseJournalMetricsRows(rows: unknown[][]): JournalMetricsLookup {

  const empty: JournalMetricsLookup = { byIssn: new Map(), byJournal: new Map() };

  const normalized = rows

    .map((row) => row.map((cell) => cellString(cell)))

    .filter((row) => row.some((c) => c.length > 0));

  if (normalized.length === 0) return empty;



  const headerRow = normalized[0];

  const colIndex = buildColumnIndex(headerRow);

  const issnIdx = colIndex("issn");

  const journalIdx = colIndex("journal");

  if (issnIdx < 0 && journalIdx < 0) {

    throw new Error("表格需包含 issn 或 journal（刊名）列");

  }



  const byIssn = new Map<string, JournalMetrics>();

  const byJournal = new Map<string, JournalMetrics>();



  for (const cells of normalized.slice(1)) {

    const metrics = parseMetricsCells(cells, colIndex);

    const issnRaw = issnIdx >= 0 ? cells[issnIdx] : undefined;

    const journalRaw = journalIdx >= 0 ? cells[journalIdx] : undefined;



    if (issnRaw?.trim()) {

      const key = normalizeIssn(issnRaw);

      if (key) byIssn.set(key, metrics);

    }

    if (journalRaw?.trim()) {

      const key = normalizeJournalKey(journalRaw);

      if (key) byJournal.set(key, metrics);

    }

  }



  return { byIssn, byJournal };

}



/** 解析实验室期刊指标 CSV（ISSN 与可选 journal 列） */

export function parseJournalMetricsCsv(text: string): JournalMetricsLookup {

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) return { byIssn: new Map(), byJournal: new Map() };

  const rows = lines.map((line) => parseCsvLine(line));

  return parseJournalMetricsRows(rows);

}



/** 解析上传文件（CSV / Excel） */

export async function parseJournalMetricsUpload(

  content: string | ArrayBuffer,

  filename?: string,

): Promise<JournalMetricsLookup> {

  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "xlsx" || ext === "xls") {

    const XLSX = await import("xlsx");

    const data = content instanceof ArrayBuffer ? new Uint8Array(content) : content;

    const wb = XLSX.read(data, { type: content instanceof ArrayBuffer ? "array" : "string" });

    const sheet = wb.Sheets[wb.SheetNames[0]];

    if (!sheet) throw new Error("Excel 文件无工作表");

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {

      header: 1,

      defval: "",

      blankrows: false,

    });

    return parseJournalMetricsRows(rows);

  }

  const text = typeof content === "string" ? content : new TextDecoder().decode(content);

  return parseJournalMetricsCsv(text);

}



/** 合并指标：CSV 优先保留 IF/分区，OpenAlex 补 citedBy / OA / 期刊级统计 */

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

    oa2yrCitedness: incoming.oa2yrCitedness ?? existing?.oa2yrCitedness,

    hIndex: incoming.hIndex ?? existing?.hIndex,

  };

}



export interface ApplyJournalMetricsResult {

  matched: number;

  updated: number;

  skipped: number;

}



export function lookupMetricsForBib(

  bib: KnowledgeBib | null | undefined,

  lookup: JournalMetricsLookup,

): JournalMetrics | null {

  for (const key of collectIssnKeys(bib)) {

    const m = lookup.byIssn.get(key);

    if (m) return m;

  }

  const journalKey = journalKeyFromBib(bib);

  if (journalKey) {

    const m = lookup.byJournal.get(journalKey);

    if (m) return m;

  }

  return null;

}



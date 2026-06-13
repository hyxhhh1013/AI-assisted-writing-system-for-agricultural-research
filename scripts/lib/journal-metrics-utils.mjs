/** @typedef {{ impactFactor?: number; impactFactorYear?: number; jcrQuartile?: string; casPartition?: string; isCoreJournal?: boolean; citedByCount?: number; openAccessUrl?: string; oa2yrCitedness?: number; hIndex?: number }} JournalMetrics */

const CANONICAL_HEADERS = [
  "issn",
  "journal",
  "impactfactor",
  "impactfactoryear",
  "jcrquartile",
  "caspartition",
  "iscorejournal",
];

const HEADER_ALIASES = {
  issn: ["issn", "eissn", "issn号", "刊号", "国际标准刊号", "printissn"],
  journal: ["journal", "journalname", "期刊", "刊名", "杂志", "期刊名称", "刊物", "source"],
  impactfactor: ["impactfactor", "if", "impact_factor", "影响因子", "因子", "jcrif"],
  impactfactoryear: ["impactfactoryear", "ifyear", "year", "年份", "数据年份", "if年"],
  jcrquartile: ["jcrquartile", "quartile", "jcr分区", "分区", "jcr", "jcrq", "wos分区"],
  caspartition: ["caspartition", "中科院", "中科院分区", "cas", "cas分区", "大类分区"],
  iscorejournal: ["iscorejournal", "北大核心", "核心刊", "核心期刊", "iscore", "pku核心"],
};

export function normalizeIssn(issn) {
  return String(issn).replace(/[-\s]/g, "").toUpperCase();
}

export function formatIssnForOpenAlex(issn) {
  const n = normalizeIssn(issn);
  if (n.length === 8) return `${n.slice(0, 4)}-${n.slice(4)}`;
  return String(issn).trim();
}

export function normalizeJournalKey(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function journalKeyFromBib(bib) {
  const raw = bib?.journal?.trim();
  if (!raw) return null;
  const comma = raw.indexOf(",");
  const head = comma > 0 ? raw.slice(0, comma).trim() : raw;
  const key = normalizeJournalKey(head);
  return key || null;
}

function normalizeHeaderToken(raw) {
  return String(raw).toLowerCase().replace(/[\s_\-]/g, "");
}

function canonicalizeHeader(raw) {
  const token = normalizeHeaderToken(raw);
  if (!token) return null;
  for (const canonical of CANONICAL_HEADERS) {
    if (token === canonical) return canonical;
  }
  for (const canonical of CANONICAL_HEADERS) {
    const aliases = HEADER_ALIASES[canonical] ?? [];
    if (aliases.some((alias) => normalizeHeaderToken(alias) === token)) return canonical;
  }
  return null;
}

function parseCsvLine(line) {
  const out = [];
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

function parseBoolCell(value) {
  if (!value?.trim()) return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "是"].includes(v)) return true;
  if (["0", "false", "no", "n", "否"].includes(v)) return false;
  return undefined;
}

function cellString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function buildColumnIndex(headerRow) {
  const indexByCanonical = new Map();
  headerRow.forEach((raw, idx) => {
    const canonical = canonicalizeHeader(raw);
    if (canonical && !indexByCanonical.has(canonical)) {
      indexByCanonical.set(canonical, idx);
    }
  });
  return (name) => indexByCanonical.get(name) ?? -1;
}

function parseMetricsCells(cells, colIndex) {
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

/** @returns {{ byIssn: Map<string, JournalMetrics>, byJournal: Map<string, JournalMetrics> }} */
export function parseJournalMetricsRows(rows) {
  const empty = { byIssn: new Map(), byJournal: new Map() };
  const normalized = rows
    .map((row) => row.map((cell) => cellString(cell)))
    .filter((row) => row.some((c) => c.length > 0));
  if (normalized.length === 0) return empty;

  const colIndex = buildColumnIndex(normalized[0]);
  const issnIdx = colIndex("issn");
  const journalIdx = colIndex("journal");
  if (issnIdx < 0 && journalIdx < 0) throw new Error("表格需包含 issn 或 journal（刊名）列");

  const byIssn = new Map();
  const byJournal = new Map();

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

/** @returns {{ byIssn: Map<string, JournalMetrics>, byJournal: Map<string, JournalMetrics> }} */
export function parseJournalMetricsCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { byIssn: new Map(), byJournal: new Map() };
  return parseJournalMetricsRows(lines.map((line) => parseCsvLine(line)));
}

export async function parseJournalMetricsFile(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Excel 文件无工作表");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    return parseJournalMetricsRows(rows);
  }
  const fs = await import("fs");
  return parseJournalMetricsCsv(fs.readFileSync(filePath, "utf-8"));
}

export function collectIssnKeys(bib) {
  if (!bib) return [];
  const keys = [];
  for (const raw of [bib.issn, bib.eissn]) {
    if (!raw?.trim()) continue;
    const n = normalizeIssn(raw);
    if (n && !keys.includes(n)) keys.push(n);
  }
  return keys;
}

export function lookupMetricsForBib(bib, lookup) {
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

export function mergeJournalMetrics(existing, incoming) {
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

export function parseMetricsJson(raw) {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializeMetrics(metrics) {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  return JSON.stringify(metrics);
}

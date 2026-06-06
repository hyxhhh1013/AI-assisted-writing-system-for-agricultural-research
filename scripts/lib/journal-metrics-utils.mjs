/** @typedef {{ impactFactor?: number; impactFactorYear?: number; jcrQuartile?: string; casPartition?: string; isCoreJournal?: boolean; citedByCount?: number; openAccessUrl?: string }} JournalMetrics */

export function normalizeIssn(issn) {
  return String(issn).replace(/[-\s]/g, "").toUpperCase();
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

/** @returns {Map<string, JournalMetrics>} */
export function parseJournalMetricsCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return new Map();

  const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const colIndex = (name) => headerCells.indexOf(name);
  const issnIdx = colIndex("issn");
  if (issnIdx < 0) throw new Error("CSV 缺少 issn 列");

  const ifIdx = colIndex("impactfactor");
  const yearIdx = colIndex("impactfactoryear");
  const qIdx = colIndex("jcrquartile");
  const casIdx = colIndex("caspartition");
  const coreIdx = colIndex("iscorejournal");

  const map = new Map();
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
    const m = lookup.get(key);
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

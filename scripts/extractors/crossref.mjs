/**
 * 通过 Crossref 公开 API 补全书目（需 DOI）
 * https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 */

const CROSSREF_BASE = "https://api.crossref.org/works";
const TIMEOUT_MS = 8000;

function crossrefUserAgent() {
  const mailto = process.env.CROSSREF_MAILTO || "grainscript@localhost";
  return `GrainScript/1.0 (mailto:${mailto})`;
}

function normalizeDoi(raw) {
  if (!raw || typeof raw !== "string") return null;
  let doi = raw.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  doi = doi.replace(/\s+/g, "");
  doi = doi.replace(/[.,;)>\]}]+$/g, "");
  return doi.length >= 8 ? doi : null;
}

function parseCrossrefAuthors(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((a) => {
      const family = a?.family?.trim() || "";
      const given = a?.given?.trim() || "";
      if (family && given) return `${family}, ${given.charAt(0)}.`;
      return family || given || "";
    })
    .filter((n) => n.length >= 2)
    .slice(0, 12);
}

function pickYear(message) {
  const parts =
    message?.published?.["date-parts"]?.[0]
    || message?.["published-print"]?.["date-parts"]?.[0]
    || message?.["published-online"]?.["date-parts"]?.[0]
    || message?.issued?.["date-parts"]?.[0];
  if (!parts?.[0]) return undefined;
  const y = Number(parts[0]);
  return y >= 1900 && y <= 2100 ? y : undefined;
}

function pickPages(message) {
  const page = message?.page?.trim();
  if (page) return page.replace(/\s+/g, "");
  const art = message?.["article-number"];
  if (art) return String(art);
  return undefined;
}

/** @returns {Promise<Record<string, unknown>>} */
export async function fetchCrossrefBib(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": crossrefUserAgent() },
      signal: controller.signal,
    });
    if (!res.ok) return {};
    const json = await res.json();
    const message = json?.message;
    if (!message) return {};

    const title = Array.isArray(message.title) ? message.title[0]?.trim() : message.title?.trim();
    const journal = Array.isArray(message["container-title"])
      ? message["container-title"][0]?.trim()
      : message["container-title"]?.trim();
    const authors = parseCrossrefAuthors(message.author);

    const bib = {
      doi,
      title: title || undefined,
      journal: journal || undefined,
      volume: message.volume ? String(message.volume) : undefined,
      issue: message.issue ? String(message.issue) : undefined,
      pages: pickPages(message),
      year: pickYear(message),
      authors: authors.length > 0 ? authors : undefined,
      firstAuthor: authors[0],
    };

    return Object.fromEntries(Object.entries(bib).filter(([, v]) => v != null && v !== ""));
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** 本地解析缺字段时，用 Crossref 补全 */
export async function enrichBibFromCrossref(bib) {
  if (!bib?.doi) return bib || {};
  const needsEnrich =
    !bib.title
    || (!bib.firstAuthor && !(bib.authors?.length > 0))
    || !bib.journal
    || !bib.year;
  if (!needsEnrich) return bib;

  const remote = await fetchCrossrefBib(bib.doi);
  if (Object.keys(remote).length === 0) return bib;

  return mergeWithEnrichment(bib, remote);
}

export function mergeWithEnrichment(base, enrichment) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(enrichment || {})) {
    if (value == null || value === "") continue;
    if (shouldReplaceField(key, out[key], value)) {
      out[key] = value;
    }
  }
  if (out.authors?.length && !out.firstAuthor) {
    out.firstAuthor = out.authors[0];
  }
  return out;
}

function shouldReplaceField(key, current, incoming) {
  if (current == null || current === "") return true;
  if (key === "title") {
    const cur = String(current);
    const inc = String(incoming);
    if (cur.length < 10 && inc.length >= 10) return true;
    if (inc.length > cur.length * 1.3 && inc.length >= 15) return true;
    return false;
  }
  if (key === "firstAuthor") {
    const cur = String(current);
    if (cur.length > 24 || /\d/.test(cur)) return true;
    return false;
  }
  if (key === "journal") {
    const cur = String(current);
    const inc = String(incoming);
    if (cur.length <= 3 && inc.length > 3) return true;
    return false;
  }
  return false;
}

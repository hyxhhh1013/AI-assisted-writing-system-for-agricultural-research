import type { ExternalLiteratureHit } from "@/contracts/literature";
import { reconstructOpenAlexAbstract } from "@/lib/literature-search";

/** 确认卡只留首段，避免把 OA 全文写进 importItems */
export const ABSTRACT_EXCERPT_MAX = 480;
const ITEM_TIMEOUT_MS = 2_500;
const MAX_FILL = 8;
const CONCURRENCY = 3;

export function clipToFirstParagraph(text: string, max = ABSTRACT_EXCERPT_MAX): string {
  const flat = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.slice(0, max);
}

/** 从落地页 HTML 取第一段可读文字。PDF 与脚本块不进确认卡。 */
export function firstParagraphFromHtml(html: string, max = ABSTRACT_EXCERPT_MAX): string | null {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const paragraphs = [...withoutCode.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 40);
  const picked = paragraphs[0];
  if (!picked) return null;
  return clipToFirstParagraph(picked, max) || null;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function doiOf(hit: ExternalLiteratureHit): string | null {
  const raw = hit.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  return raw || null;
}

async function readText(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (/pdf|octet-stream/i.test(type)) return null;
  return res.text();
}

async function excerptFromOpenAlex(
  doi: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string | null> {
  const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?select=abstract_inverted_index`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "GrainScript/1.0 (import-confirm)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await readText(res);
  if (!raw) return null;
  const data = JSON.parse(raw) as { abstract_inverted_index?: unknown };
  const text = reconstructOpenAlexAbstract(data.abstract_inverted_index);
  return text ? clipToFirstParagraph(text) : null;
}

async function excerptFromLanding(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string | null> {
  if (isPdfUrl(url)) return null;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "GrainScript/1.0 (import-confirm)", Accept: "text/html" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const raw = await readText(res);
  if (!raw || /%PDF-/.test(raw.slice(0, 20))) return null;
  return firstParagraphFromHtml(raw);
}

async function excerptForHit(
  hit: ExternalLiteratureHit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string | null> {
  const doi = doiOf(hit);
  if (doi) {
    try {
      const fromAlex = await excerptFromOpenAlex(doi, fetchImpl, timeoutMs);
      if (fromAlex) return fromAlex;
    } catch {
      /* 软失败，继续试落地页 */
    }
  }
  const landing = hit.openAccessUrl?.trim() && !isPdfUrl(hit.openAccessUrl)
    ? hit.openAccessUrl.trim()
    : doi
      ? `https://doi.org/${doi}`
      : "";
  if (!landing) return null;
  try {
    return await excerptFromLanding(landing, fetchImpl, timeoutMs);
  } catch {
    return null;
  }
}

/**
 * 没有摘要的候选项补一段 OA / DOI 首段。超时或失败保持原文，不阻断确认卡。
 * 最多补 MAX_FILL 篇，避免 25 路外网把确认卡拖死。
 */
export async function fillMissingAbstractExcerpts(
  items: ExternalLiteratureHit[],
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Array<ExternalLiteratureHit & { abstractExcerpt?: boolean }>> {
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts?.timeoutMs ?? ITEM_TIMEOUT_MS;
  const targets = new Set<number>();
  items.forEach((hit, index) => {
    if (targets.size >= MAX_FILL) return;
    if (!hit.abstract?.trim() && (doiOf(hit) || hit.openAccessUrl?.trim())) {
      targets.add(index);
    }
  });
  if (targets.size === 0) return items;

  const filled: Array<ExternalLiteratureHit & { abstractExcerpt?: boolean }> = items.map(
    (hit) => ({ ...hit }),
  );
  const queue = [...targets];
  async function worker(): Promise<void> {
    for (;;) {
      const index = queue.shift();
      if (index == null) return;
      const hit = filled[index];
      if (!hit) continue;
      const excerpt = await excerptForHit(hit, fetchImpl, timeoutMs);
      if (!excerpt) continue;
      filled[index] = { ...hit, abstract: excerpt, abstractExcerpt: true };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );
  return filled;
}

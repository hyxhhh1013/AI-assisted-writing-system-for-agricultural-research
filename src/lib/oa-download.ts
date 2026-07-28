/**
 * ENG-PR-094：开放获取 PDF 下载（合法性 / 大小 / MIME / SSRF 基础防护）
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("oa-download");

export const OA_MAX_BYTES = 40 * 1024 * 1024; // 40MB
export const OA_FETCH_TIMEOUT_MS = 25_000;

export type OaDownloadFailureReason =
  | "disabled"
  | "no_url"
  | "bad_url"
  | "ssrf_blocked"
  | "http_error"
  | "too_large"
  | "not_pdf"
  | "timeout"
  | "network";

export type OaDownloadResult =
  | { ok: true; buffer: Buffer; contentType: string | null; finalUrl: string }
  | { ok: false; reason: OaDownloadFailureReason; detail?: string };

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "metadata.google.internal") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;

  // IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  // IPv6 local / ULA
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  return false;
}

/** 校验 OA URL：仅 https（或 http），拒绝内网与明显非 PDF 落地页策略在下载后校验 */
export function validateOaPdfUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: OaDownloadFailureReason; detail?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "no_url" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "bad_url", detail: "URL 无法解析" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "bad_url", detail: "仅允许 http(s)" };
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    return { ok: false, reason: "ssrf_blocked", detail: url.hostname };
  }
  return { ok: true, url };
}

function looksLikePdf(buffer: Buffer, contentType: string | null): boolean {
  if (buffer.length < 5) return false;
  const head = buffer.subarray(0, 5).toString("latin1");
  if (head.startsWith("%PDF")) return true;
  const ct = (contentType || "").toLowerCase();
  // 部分仓库 Content-Type 不准，仍以魔数为主；若声明 pdf 但魔数不对则拒绝
  if (ct.includes("application/pdf") && head.startsWith("%PDF")) return true;
  return false;
}

/**
 * 下载 OA PDF。调用方负责开关；此处只做安全与格式校验。
 */
export async function downloadOaPdf(
  rawUrl: string,
  opts?: { maxBytes?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<OaDownloadResult> {
  const validated = validateOaPdfUrl(rawUrl);
  if (!validated.ok) return validated;

  const maxBytes = opts?.maxBytes ?? OA_MAX_BYTES;
  const timeoutMs = opts?.timeoutMs ?? OA_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts?.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const res = await fetch(validated.url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/pdf,*/*",
        "User-Agent": "GrainScriptOABot/1.0 (+local research assistant)",
      },
    });

    if (!res.ok) {
      return { ok: false, reason: "http_error", detail: `HTTP ${res.status}` };
    }

    // 重定向后再次检查最终 URL 主机
    const finalUrl = res.url || validated.url.toString();
    const finalCheck = validateOaPdfUrl(finalUrl);
    if (!finalCheck.ok) return finalCheck;

    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const n = Number(lenHeader);
      if (Number.isFinite(n) && n > maxBytes) {
        return { ok: false, reason: "too_large", detail: String(n) };
      }
    }

    const contentType = res.headers.get("content-type");
    const reader = res.body?.getReader();
    if (!reader) {
      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      if (buffer.length > maxBytes) {
        return { ok: false, reason: "too_large", detail: String(buffer.length) };
      }
      if (!looksLikePdf(buffer, contentType)) {
        return { ok: false, reason: "not_pdf", detail: contentType || "no-magic" };
      }
      return { ok: true, buffer, contentType, finalUrl };
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { ok: false, reason: "too_large", detail: String(total) };
      }
      chunks.push(Buffer.from(value));
    }
    const buffer = Buffer.concat(chunks, total);
    if (!looksLikePdf(buffer, contentType)) {
      return { ok: false, reason: "not_pdf", detail: contentType || "no-magic" };
    }
    return { ok: true, buffer, contentType, finalUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) {
      return { ok: false, reason: "timeout", detail: msg };
    }
    log.warn("oa download failed", { url: validated.url.toString(), msg });
    return { ok: false, reason: "network", detail: msg };
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** 环境变量 / 默认：开启 OA 自动入库（设 ENABLE_OA_AUTO_IMPORT=0 关闭） */
export async function isOaAutoImportEnabled(): Promise<boolean> {
  const env = process.env.ENABLE_OA_AUTO_IMPORT?.trim().toLowerCase();
  if (env === "0" || env === "false" || env === "off" || env === "no") return false;
  if (env === "1" || env === "true" || env === "on" || env === "yes") return true;
  try {
    const { getSetting } = await import("@/lib/settings");
    const v = (await getSetting("ENABLE_OA_AUTO_IMPORT"))?.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  } catch {
    /* ignore */
  }
  return true;
}

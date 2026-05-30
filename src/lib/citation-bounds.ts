/**
 * 引用越界校验 — 全项目共享的归一化 + 范围检查层
 *
 * 解决的核心问题：AI 生成的 [n] 引用编号超出实际文献列表长度。
 * 被 preview（shared.tsx）、export（server-pdf.ts）、writing（route.ts）三方复用。
 */

import { CITATION_GROUP_RE, FULLWIDTH_CITATION_RE, expandCitationGroup } from "@/lib/citation";

// ── 归一化 ──────────────────────────────────────────────────────────────────

/**
 * 将所有非标准引用格式统一归一化为 [n] 格式。
 * 合并了 reference-reorder.ts 的 normalizeCitationFormat 并补充更多变体。
 */
export function normalizeAllCitationFormats(text: string): string {
  if (!text) return text;
  let t = text;

  // 全角方括号 → 半角
  t = t.replace(/［([0-9,\s\-–—，、]+)］/g, (_m, inner) => `[${inner}]`);

  // [参考来源23] / [参考来源 [23]] → [23]
  t = t.replace(/\[参考来源\s*(?:\[)?(\d+)(?:\])?\]/g, "[$1]");

  // [文献23] / [文献 23] → [23]
  t = t.replace(/\[文献\s*(\d+)\]/g, "[$1]");

  // [Ref 23] / [ref 23] → [23]
  t = t.replace(/\[[Rr]ef\s*(\d+)\]/g, "[$1]");

  // [参23] / [参 23] → [23]（简写变体）
  t = t.replace(/\[参\s*(\d+)\]/g, "[$1]");

  // [来源23] → [23]
  t = t.replace(/\[来源\s*(\d+)\]/g, "[$1]");

  return t;
}

// ── 越界检测与清理 ──────────────────────────────────────────────────────────

export interface BoundsCheckResult {
  /** 清理后的文本（越界引用已替换为 [引用?]） */
  cleaned: string;
  /** 越界的引用编号列表（去重、排序） */
  outOfBounds: number[];
}

/**
 * 检测并清理文本中超出 refCount 范围的引用。
 * 越界引用替换为 [引用?] 占位符，后续由 cleanMarkdownArtifacts 统一清除。
 */
export function markOutOfBoundsCitations(text: string, refCount: number): BoundsCheckResult {
  if (!text || refCount <= 0) return { cleaned: text, outOfBounds: [] };

  const normalized = normalizeAllCitationFormats(text);
  const outOfBoundsSet = new Set<number>();

  // 第一遍：收集所有越界编号
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  while ((m = re.exec(normalized)) !== null) {
    for (const num of expandCitationGroup(m[1])) {
      if (num > refCount) outOfBoundsSet.add(num);
    }
  }

  if (outOfBoundsSet.size === 0) return { cleaned: text, outOfBounds: [] };

  const outOfBounds = Array.from(outOfBoundsSet).sort((a, b) => a - b);

  // 第二遍：替换越界引用为占位符
  const cleaned = normalized.replace(CITATION_GROUP_RE, (_match, raw: string) => {
    const parts = raw.split(/[,，、]/);
    const validParts: string[] = [];

    for (const part of parts) {
      const token = part.trim();
      if (!token) continue;

      const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        // 保留范围内的合法部分
        const validInRange: number[] = [];
        for (let n = start; n <= end; n++) {
          if (n >= 1 && n <= refCount) validInRange.push(n);
        }
        if (validInRange.length > 0) {
          if (validInRange.length === 1) {
            validParts.push(String(validInRange[0]));
          } else {
            validParts.push(`${validInRange[0]}-${validInRange[validInRange.length - 1]}`);
          }
        }
        continue;
      }

      const n = parseInt(token, 10);
      if (!isNaN(n) && n >= 1 && n <= refCount) {
        validParts.push(token);
      }
      // 越界的直接丢弃
    }

    if (validParts.length === 0) return "[引用?]";
    return `[${validParts.join(", ")}]`;
  });

  return { cleaned, outOfBounds };
}

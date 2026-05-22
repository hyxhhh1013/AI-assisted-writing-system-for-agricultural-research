/** 引文处理 — 全项目单一数据源 */

/**
 * 引文组正则：[1], [1,2], [3-5], [1,3-5]
 * 支持中文逗号（，）、顿号（、）和全角方括号（［］）
 */
export const CITATION_GROUP_RE = /\[([0-9,\s\-–—，、]+)\]/g;
/** 全角方括号变体：［1］, ［1,2］ */
export const FULLWIDTH_CITATION_RE = /［([0-9,\s\-–—，、]+)］/g;

/** 展开引文组为数字数组，可选 refCount 上限校验 */
export function expandCitationGroup(raw: string, refCount?: number): number[] {
  const nums: number[] = [];
  const parts = raw.split(/[,，、]/);

  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
        if (n < 1) continue;
        if (refCount != null && n > refCount) continue;
        if (!nums.includes(n)) nums.push(n);
      }
      continue;
    }

    const single = token.match(/^\d+$/);
    if (single) {
      const n = parseInt(token, 10);
      if (n < 1) continue;
      if (refCount != null && n > refCount) continue;
      if (!nums.includes(n)) nums.push(n);
    }
  }

  return nums;
}

/**
 * 无上限校验的展开（向后兼容 shared.tsx 的 expandCiteGroup）。
 * @deprecated 请优先使用 expandCitationGroup(raw, refCount) 以启用上限校验。
 */
export function expandCiteGroup(raw: string): number[] {
  return expandCitationGroup(raw);
}

/** 将正文中的 [n] 替换为可点击的 HTML 标签 */
export function processCitations(text: string): string {
  const normalized = text.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`);
  return normalized.replace(
    CITATION_GROUP_RE,
    (match, raw: string) =>
      `<sup class="ref-cite" data-cite="${raw.replace(/\s/g, "")}" style="cursor:pointer;color:#2563eb;font-weight:600;transition:color 0.15s">${match}</sup>`,
  );
}

/** 创建引用点击事件处理器 */
export function handleCiteClick(onCiteClick: (nums: number[]) => void) {
  return (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cite = target.closest(".ref-cite") as HTMLElement | null;
    if (!cite) return;
    const raw = cite.getAttribute("data-cite");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    onCiteClick(expandCiteGroup(raw));
  };
}

/**
 * /plot 精修预填：避免长 figureSpec 塞 URL 被截断。
 * 点击「绘图页精修」时写入 sessionStorage，plot 页优先读取。
 */

const PREFIX = "gs:plot-prefill:";

export function plotPrefillStorageKey(opts: {
  chartAssetId?: string;
  imageUrl?: string;
  projectId?: string;
}): string | null {
  if (opts.chartAssetId) return `${PREFIX}asset:${opts.chartAssetId}`;
  if (opts.imageUrl) return `${PREFIX}img:${opts.imageUrl}`;
  if (opts.projectId) return `${PREFIX}proj:${opts.projectId}:latest`;
  return null;
}

export function stashPlotPrefill(opts: {
  figureSpecEnc: string;
  chartAssetId?: string;
  imageUrl?: string;
  projectId?: string;
}): void {
  if (typeof sessionStorage === "undefined") return;
  const key = plotPrefillStorageKey(opts);
  if (!key || !opts.figureSpecEnc) return;
  try {
    sessionStorage.setItem(key, opts.figureSpecEnc);
  } catch {
    /* quota / private mode */
  }
}

export function takePlotPrefill(opts: {
  chartAssetId?: string;
  imageUrl?: string;
  projectId?: string;
}): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const keys = [
    plotPrefillStorageKey({ chartAssetId: opts.chartAssetId }),
    plotPrefillStorageKey({ imageUrl: opts.imageUrl }),
    plotPrefillStorageKey({ projectId: opts.projectId }),
  ].filter((k): k is string => Boolean(k));

  for (const key of keys) {
    try {
      const v = sessionStorage.getItem(key);
      if (v) {
        sessionStorage.removeItem(key);
        return v;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

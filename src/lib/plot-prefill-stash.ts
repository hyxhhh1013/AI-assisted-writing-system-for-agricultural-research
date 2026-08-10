/**
 * /plot 精修预填：避免长 figureSpec 塞 URL 被截断。
 * 点击「绘图页精修」时写入 localStorage（须跨 target=_blank 新标签可读；
 * sessionStorage 按标签隔离，新开页读不到）。
 */

const PREFIX = "gs:plot-prefill:";

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

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
  const store = storage();
  if (!store) return;
  const key = plotPrefillStorageKey(opts);
  if (!key || !opts.figureSpecEnc) return;
  try {
    store.setItem(key, opts.figureSpecEnc);
  } catch {
    /* quota / private mode */
  }
}

export function takePlotPrefill(opts: {
  chartAssetId?: string;
  imageUrl?: string;
  projectId?: string;
}): string | null {
  const store = storage();
  if (!store) return null;
  const keys = [
    plotPrefillStorageKey({ chartAssetId: opts.chartAssetId }),
    plotPrefillStorageKey({ imageUrl: opts.imageUrl }),
    plotPrefillStorageKey({ projectId: opts.projectId }),
  ].filter((k): k is string => Boolean(k));

  for (const key of keys) {
    try {
      const v = store.getItem(key);
      if (v) {
        store.removeItem(key);
        return v;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

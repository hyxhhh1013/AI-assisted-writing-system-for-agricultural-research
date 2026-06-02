/** GET /api/figures/registry — 图表注册表 */

export interface FigureDef {
  id: string;
  name: string;
  category: string;
  description: string;
  endpoint: string;
  input_type: "tabular" | "json" | "form";
  example?: string;
  config_fields?: { key: string; label: string; type: string; options?: string[] }[];
}

export interface FigureCategoryDef {
  id: string;
  name: string;
  icon: string;
  order: number;
}

export interface FigureRegistry {
  categories: FigureCategoryDef[];
  figures: FigureDef[];
}

export async function getFigureRegistry(): Promise<FigureRegistry> {
  const res = await fetch("/api/figures/registry");
  if (!res.ok) throw new Error("加载图表注册表失败");
  return res.json() as Promise<FigureRegistry>;
}

export interface FigureGenerateResult {
  url: string;
  error?: string;
}

async function figureFetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = options.signal;
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 为单个 FIGURE 标记调用对应生成 API（chart / xrd / flow / mechanism） */
export async function generateFigure(
  tool: string,
  config: Record<string, unknown>,
  caption: string,
  signal?: AbortSignal,
): Promise<FigureGenerateResult> {
  if (signal?.aborted) return { url: "", error: "已取消" };

  if (tool === "chart") {
    const fd = new FormData();
    if (config.data && typeof config.data === "object") {
      const data = config.data as { labels?: string[]; datasets?: Array<{ label?: string; data: number[] }> };
      if (data.labels && data.datasets) {
        let csv = "X," + data.labels.join(",") + "\n";
        for (const ds of data.datasets) {
          csv += (ds.label || "data") + "," + ds.data.join(",") + "\n";
        }
        fd.append("dataFile", new Blob([csv], { type: "text/csv" }), "data.csv");
      }
    } else if (config.data_file) {
      const resp = await figureFetchWithTimeout(config.data_file as string, { signal });
      const blob = await resp.blob();
      fd.append("dataFile", blob, "data.csv");
    }
    if (fd.has("dataFile")) {
      fd.append(
        "config",
        JSON.stringify({ title: caption, chart_type: config.chart_type || config.type || "bar", data: config.data }),
      );
      const r = await figureFetchWithTimeout("/api/chart", { method: "POST", body: fd, signal });
      const j = (await r.json()) as { error?: string; imageUrl?: string };
      if (j.error) return { url: "", error: j.error };
      return { url: j.imageUrl || "" };
    }
    return { url: "", error: "chart: 无有效数据" };
  }

  if (tool === "xrd_peakfit" && config.data_file) {
    const fd = new FormData();
    const resp = await figureFetchWithTimeout(config.data_file as string, { signal });
    const blob = await resp.blob();
    fd.append("dataFile", blob, "data.csv");
    fd.append("config", JSON.stringify({ title: caption, bg_params: {}, peak_params: { max_peaks: 15 } }));
    const r = await figureFetchWithTimeout("/api/xrd/peakfit", { method: "POST", body: fd, signal });
    const j = (await r.json()) as { error?: string; imageUrl?: string };
    if (j.error) return { url: "", error: j.error };
    return { url: j.imageUrl || "" };
  }

  if (tool === "flow") {
    const r = await figureFetchWithTimeout("/api/flow-diagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, renderer: "graphviz" }),
      signal,
    });
    const j = (await r.json()) as { error?: string; imageUrl?: string };
    if (j.error) return { url: "", error: j.error };
    return { url: j.imageUrl || "" };
  }

  if (tool === "mechanism") {
    const mechanismCfg = {
      title: (config.title || config.description || "反应机理") as string,
      direction: "vertical",
      nodes: [
        { id: "1", label: ((config.description as string)?.slice(0, 20) || "机理过程") },
        { id: "2", label: "产物" },
      ],
      edges: [{ from: "1", to: "2" }],
    };
    const r = await figureFetchWithTimeout("/api/flow-diagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mechanismCfg, renderer: "graphviz" }),
      signal,
    });
    const j = (await r.json()) as { error?: string; imageUrl?: string };
    if (j.error) return { url: "", error: j.error };
    return { url: j.imageUrl || "" };
  }

  return { url: "", error: `未知图表工具: ${tool}` };
}

/** @deprecated 使用 generateFigure；保留别名供旧 import */
export const generateSingleFigure = generateFigure;

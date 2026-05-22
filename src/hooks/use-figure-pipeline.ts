"use client";

import { useRef, useCallback, useState } from "react";

interface PendingFigure {
  spec: string;
  tool: string;
  config: string;
  caption: string;
  status: "pending" | "generating" | "done" | "failed";
  imageUrl?: string;
}

interface UseFigurePipelineReturn {
  pendingFigures: PendingFigure[];
  processFigures: (text: string, existingFigures?: PendingFigure[]) => Promise<{
    processedText: string;
    figures: PendingFigure[];
  }>;
  cancelFigures: () => void;
  setPendingFigures: (figures: PendingFigure[]) => void;
}

/** 找到 FIGURE 标记块 */
export function findFigureBlocks(text: string): { json: Record<string, unknown>; raw: string }[] {
  const results: { json: Record<string, unknown>; raw: string }[] = [];
  const blockRegex = /[【\[]FIG(?:URE)?:(\{)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const jsonStart = match.index + match[0].length - 1;
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    // 如果正常匹配不到——通常是 AI 漏了最外层的 }，而后面是 】
    // 尝试用 】作为结束标记，提取后再补全缺失的 }
    if (jsonEnd === -1) {
      const closeIdx = text.indexOf("】", jsonStart);
      jsonEnd = closeIdx !== -1 ? closeIdx - 1 : text.length - 1;
      // 跳过 】 前面的非 } 字符
      while (jsonEnd > jsonStart && text[jsonEnd] !== "}" && text[jsonEnd] !== "】") jsonEnd--;
      if (jsonEnd <= jsonStart) continue;
    }
    const raw = text.slice(match.index, jsonEnd + 2);
    let jsonStr = text.slice(jsonStart, jsonEnd + 1);
    try {
      let json = JSON.parse(jsonStr) as Record<string, unknown>;
      // AI 有时把 caption 写在 config 内部（因为漏了 config 的 }）
      if (!json.caption && json.config && typeof json.config === "object") {
        const cfg = json.config as Record<string, unknown>;
        if (typeof cfg.caption === "string") {
          json.caption = cfg.caption;
          delete cfg.caption;
        }
      }
      if (json.tool && json.config && json.caption) {
        results.push({ json, raw });
      } else {
        console.warn("[Figure] FIGURE block missing tool/config/caption:", jsonStr.slice(0, 100));
      }
    } catch {
      // 尝试修复 AI 常见 JSON 错误
      let fixed = jsonStr;
      // 0) 修复 [num,num,num} → [num,num,num]} （AI 常漏掉数组闭合 ]）
      fixed = fixed.replace(
        /\[([0-9.,\-+\s]+)\}/g,
        (_m: string, nums: string) => {
          // 确保以 ]} 结束，不是单个 }
          return `[${nums}]}`;
        }
      );
      // 1) 自动修复对象数组缺 [] 包裹：{...},{...} → [{...},{...}]
      //    AI 经常对 datasets / nodes / edges 漏掉外层方括号
      const arrayKeys = ["datasets", "nodes", "edges"];
      for (const key of arrayKeys) {
        const keyMatch = fixed.match(new RegExp(`"${key}":`));
        if (!keyMatch || keyMatch.index === undefined) continue;
        let pos = keyMatch.index + key.length + 3; // skip "key":
        const start = pos;
        // 跳过空白
        while (pos < fixed.length && fixed[pos] === ' ') pos++;
        if (pos >= fixed.length || fixed[pos] !== '{') continue; // 已经是 "[{...}]" 或不是对象
        // 括号计数：需要感知 [] 防止 data 数组内的 } 干扰
        let depth = 0;
        let arrayDepth = 0;
        let instr = false;
        let escChar = false;
        let lastObjEnd = -1;
        for (; pos < fixed.length; pos++) {
          const c = fixed[pos];
          if (escChar) { escChar = false; continue; }
          if (c === '\\') { escChar = true; continue; }
          if (c === '"') { instr = !instr; continue; }
          if (instr) continue;
          if (c === '[') { arrayDepth++; continue; }
          if (c === ']') { if (arrayDepth > 0) arrayDepth--; continue; }
          if (c === '{' && arrayDepth === 0) { depth++; }
          else if (c === '}' && arrayDepth === 0) {
            depth--;
            if (depth === 0) {
              lastObjEnd = pos;
              let n = pos + 1;
              while (n < fixed.length && (fixed[n] === ' ' || fixed[n] === ',' || fixed[n] === '\n' || fixed[n] === '\r')) n++;
              if (n < fixed.length && fixed[n] === '{') { depth = 0; /* next object */ continue; }
              break;
            }
          }
        }
        if (lastObjEnd < 0) continue;
        const valuePart = fixed.slice(start, lastObjEnd + 1);
        const objCount = (valuePart.match(/\{[^}]*"(?:id|label|from)"\s*:/g) || []).length;
        if (objCount > 1 && fixed[start] === '{') {
          let after = fixed.slice(lastObjEnd + 1);
          if (after[0] === ']') after = after.slice(1);
          fixed = fixed.slice(0, start) + '[' + valuePart + ']' + after;
        }
      }
      // 2) 补全缺失的 }（AI 常漏掉 config/data 闭合括号）
      let opens = 0, closes = 0;
      let inStr2 = false, esc2 = false;
      for (let i = 0; i < fixed.length; i++) {
        const c = fixed[i];
        if (esc2) { esc2 = false; continue; }
        if (c === '\\') { esc2 = true; continue; }
        if (c === '"') { inStr2 = !inStr2; continue; }
        if (inStr2) continue;
        if (c === '{') opens++;
        if (c === '}') closes++;
      }
      if (opens > closes) fixed += '}'.repeat(opens - closes);
      // 重新解析
      try {
        const json = JSON.parse(fixed) as Record<string, unknown>;
        // AI 有时把 caption 写在 config 内部（因为漏了 config 的 }）
        if (!json.caption && json.config && typeof json.config === "object") {
          const cfg = json.config as Record<string, unknown>;
          if (typeof cfg.caption === "string") {
            json.caption = cfg.caption;
            delete cfg.caption;
          }
        }
        if (json.tool && json.config && json.caption) {
          console.warn("[Figure] Auto-fixed malformed JSON in FIGURE marker");
          results.push({ json, raw });
          continue;
        }
      } catch { /* still broken */ }
      console.warn("[Figure] JSON parse failed:", jsonStr.slice(0, 120));
    }
  }
  return results;
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 处理文本中的插图占位符 */
export function replacePlaceholders(text: string): { processedText: string; count: number } {
  const placeholderRegex = /【插图占位：([^】]+)】/g;
  let count = 0;
  const processedText = text.replace(placeholderRegex, (_m, caption) => {
    count++;
    return `\n\n> 📊 **${caption.trim()}**（待补充数据）\n\n`;
  });
  return { processedText, count };
}

/**
 * 为单个 FIGURE 调用对应的生成 API，返回 { url, error? }。
 */
export async function generateSingleFigure(
  tool: string,
  config: Record<string, unknown>,
  caption: string,
  signal?: AbortSignal,
): Promise<{ url: string; error?: string }> {
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
      const resp = await fetchWithTimeout(config.data_file as string, { signal });
      const blob = await resp.blob();
      fd.append("dataFile", blob, "data.csv");
    }
    if (fd.has("dataFile")) {
      fd.append("config", JSON.stringify({ title: caption, chart_type: config.chart_type || config.type || "bar", data: config.data }));
      const r = await fetchWithTimeout("/api/chart", { method: "POST", body: fd, signal });
      const j = await r.json();
      if (j.error) return { url: "", error: j.error as string };
      return { url: (j.imageUrl as string) || "" };
    }
    return { url: "", error: "chart: 无有效数据" };
  }

  if (tool === "xrd_peakfit" && config.data_file) {
    const fd = new FormData();
    const resp = await fetchWithTimeout(config.data_file as string, { signal });
    const blob = await resp.blob();
    fd.append("dataFile", blob, "data.csv");
    fd.append("config", JSON.stringify({ title: caption, bg_params: {}, peak_params: { max_peaks: 15 } }));
    const r = await fetchWithTimeout("/api/xrd/peakfit", { method: "POST", body: fd, signal });
    const j = await r.json();
    if (j.error) return { url: "", error: j.error as string };
    return { url: (j.imageUrl as string) || "" };
  }

  if (tool === "flow") {
    const r = await fetchWithTimeout("/api/flow-diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, renderer: "graphviz" }), signal });
    const j = await r.json();
    if (j.error) return { url: "", error: j.error as string };
    return { url: (j.imageUrl as string) || "" };
  }

  if (tool === "mechanism") {
    const mechanismCfg = {
      title: (config.title || config.description || "反应机理") as string,
      direction: "vertical",
      nodes: [{ id: "1", label: ((config.description as string)?.slice(0, 20) || "机理过程") }, { id: "2", label: "产物" }],
      edges: [{ from: "1", to: "2" }],
    };
    const r = await fetchWithTimeout("/api/flow-diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...mechanismCfg, renderer: "graphviz" }), signal });
    const j = await r.json();
    if (j.error) return { url: "", error: j.error as string };
    return { url: (j.imageUrl as string) || "" };
  }

  return { url: "", error: `未知图表工具: ${tool}` };
}

// === React Hook ===

export function useFigurePipeline(): UseFigurePipelineReturn {
  const abortRef = useRef<AbortController | null>(null);
  const [pendingFigures, setPendingFiguresState] = useState<PendingFigure[]>([]);

  const cancelFigures = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const setPendingFigures = useCallback((figures: PendingFigure[]) => {
    setPendingFiguresState(figures);
  }, []);

  const processFigures = useCallback(async (
    text: string,
    existingFigures: PendingFigure[] = [],
  ): Promise<{ processedText: string; figures: PendingFigure[] }> => {
    const figureBlocks = findFigureBlocks(text);
    if (figureBlocks.length === 0) return { processedText: text, figures: existingFigures };

    const figures: PendingFigure[] = [...existingFigures];
    let processedText = text;
    const figureAbort = new AbortController();
    abortRef.current = figureAbort;

    for (const block of figureBlocks) {
      if (figureAbort.signal.aborted) break;
      const json = block.json;
      const tool = json.tool as string;
      const config = json.config as Record<string, unknown>;
      const caption = json.caption as string;
      if (!tool || !config || !caption) continue;

      const fig: PendingFigure = { spec: "", tool, config: JSON.stringify(config), caption, status: "generating" };
      figures.push(fig);
      processedText = processedText.replace(block.raw, `\n\n*[正在生成 ${caption}...]*\n\n`);

      try {
        const result = await generateSingleFigure(tool, config, caption, figureAbort.signal);
        if (result.url) {
          fig.status = "done";
          fig.imageUrl = result.url;
          processedText = processedText.replace(`*[正在生成 ${caption}...]*`, `![${caption}](${result.url})`);
        } else {
          fig.status = "failed";
          const reason = result.error || "生成失败";
          processedText = processedText.replace(`*[正在生成 ${caption}...]*`, `\n\n> 📊 **${caption}**（${reason}，请手动补充）\n\n`);
        }
      } catch {
        fig.status = "failed";
        processedText = processedText.replace(`*[正在生成 ${caption}...]*`, `\n\n> 📊 **${caption}**（网络异常，请手动补充）\n\n`);
      }
    }

    return { processedText, figures };
  }, []);

  return { pendingFigures, processFigures, cancelFigures, setPendingFigures };
}

"use client";

import { useRef, useCallback, useState } from "react";
import { generateFigure } from "@/services/figures";
import { createLogger } from "@/lib/logger";

const log = createLogger("figure-pipeline");

export { generateFigure, generateFigure as generateSingleFigure } from "@/services/figures";

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

function figureMarkerCloseChar(openChar: string): string {
  return openChar === "【" ? "】" : "]";
}

/** 找到 FIGURE 标记块 */
export function findFigureBlocks(text: string): { json: Record<string, unknown>; raw: string }[] {
  const results: { json: Record<string, unknown>; raw: string }[] = [];
  const blockRegex = /[【\[]FIG(?:URE)?:\s*(\{)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const openChar = text[match.index] ?? "【";
    const closeChar = figureMarkerCloseChar(openChar);
    const jsonStart = match.index + match[0].length - 1;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      const c = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i;
          break;
        }
      }
    }
    // 如果正常匹配不到——通常是 AI 漏了最外层的 }，而后面是 】/]
    if (jsonEnd === -1) {
      const closeIdx = text.indexOf(closeChar, jsonStart);
      jsonEnd = closeIdx !== -1 ? closeIdx - 1 : text.length - 1;
      while (jsonEnd > jsonStart && text[jsonEnd] !== "}" && text[jsonEnd] !== closeChar) jsonEnd--;
      if (jsonEnd <= jsonStart) continue;
    }
    let rawEnd = jsonEnd + 1;
    if (text[rawEnd] === closeChar) rawEnd++;
    const raw = text.slice(match.index, rawEnd);
    const jsonStr = text.slice(jsonStart, jsonEnd + 1);
    try {
      const json = JSON.parse(jsonStr) as Record<string, unknown>;
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
        log.warn("FIGURE block missing tool/config/caption", { preview: jsonStr.slice(0, 100) });
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
          log.warn("auto-fixed malformed JSON in FIGURE marker");
          results.push({ json, raw });
          continue;
        }
      } catch { /* still broken */ }
      log.warn("FIGURE JSON parse failed", { preview: jsonStr.slice(0, 120) });
    }
  }
  return results;
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
        const result = await generateFigure(tool, config, caption, figureAbort.signal);
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

/**
 * 影子重建：新阅读顺序只写入 data/shadow，不覆盖线上 index_*.json / .emb。
 * 一次一个分类。跨栏页保留旧抽取文本。
 */

import fs from "fs";
import path from "path";
import { joinLegacyPageText } from "../extractors/legacy-order.mjs";
import { shadowPageFromItems, stripRepeatedMarginLines } from "../extractors/reading-order.mjs";
import { isLikelyReferencesText } from "./index-text-filters.mjs";
import { segmentLinesBySection } from "./paper-section.mjs";

export function assertInsideShadow(shadowRoot, target) {
  const root = path.resolve(shadowRoot);
  const resolved = path.resolve(target);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("拒绝写出影子目录");
  }
  return resolved;
}

export function shadowChunkPath(shadowRoot, category, filename) {
  if (!category || category.includes("..") || /[\\/]/.test(category)) {
    throw new Error("分类名不能包含路径");
  }
  const base = path.basename(filename);
  if (!base || base === "." || base === ".." || base !== filename) {
    throw new Error("文献名必须是文件名");
  }
  return assertInsideShadow(shadowRoot, path.join(shadowRoot, "chunks", category, `${base}.json`));
}

export function selectShadowFiles(files, { names, category } = {}) {
  const wanted = (names || []).map((name) => name.trim()).filter(Boolean);
  if (!wanted.length && !category) {
    throw new Error("需要 --files= 或 --category=，一次只处理一个分类");
  }
  let picked = files || [];
  if (category) picked = picked.filter((file) => file.category === category);
  if (wanted.length) {
    const want = new Set(wanted);
    picked = picked.filter((file) => want.has(file.name));
    const missing = wanted.filter((name) => !picked.some((file) => file.name === name));
    if (missing.length) throw new Error(`未找到文献：${missing.join("、")}`);
  }
  if (picked.length === 0) throw new Error("没有要处理的 PDF");
  const categories = new Set(picked.map((file) => file.category));
  if (categories.size > 1) throw new Error("一次只能处理一个分类");
  return picked;
}

export function listPdfFiles(articlesDir) {
  const all = [];
  const walk = (dir, category) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full, item);
      else if (item.toLowerCase().endsWith(".pdf")) {
        all.push({ path: full, name: item, category, mtime: stat.mtimeMs });
      }
    }
  };
  walk(articlesDir, "未分类");
  const byName = new Map();
  for (const file of all) {
    if (!byName.has(file.name)) byName.set(file.name, file);
  }
  return [...byName.values()];
}

function pageTextUsable(text) {
  if (!text) return false;
  if (text.length >= 30) return true;
  return (text.match(/[\u4e00-\u9fff]/g) || []).length >= 8;
}

/**
 * @param {{ page: number, items: object[], legacyText?: string }[]} pageInputs
 */
export function buildShadowPages(pageInputs) {
  const built = (pageInputs || []).map((page) => {
    const legacyText = page.legacyText ?? joinLegacyPageText(page.items);
    const shadow = shadowPageFromItems(page.items, legacyText);
    return {
      page: page.page,
      keptOld: shadow.keptOld,
      crossColumn: shadow.crossColumn,
      lines: shadow.keptOld
        ? []
        : shadow.lines.filter((line) => !line.crossColumn && line.text).map((line) => ({ text: line.text, y: line.y })),
      text: shadow.text,
    };
  });
  const stripped = stripRepeatedMarginLines(built.map((page) => ({ lines: page.lines })));
  return built.map((page, index) => {
    if (page.keptOld) {
      return { page: page.page, text: page.text, keptOld: true, crossColumn: page.crossColumn };
    }
    const text = (stripped[index]?.lines || []).map((line) => line.text).join("\n");
    return { page: page.page, text, keptOld: false, crossColumn: 0, lines: stripped[index]?.lines || [] };
  });
}

export function splitWindow(text, size = 1000, overlap = 200) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length < 15) return [];
  if (clean.length <= size) return [clean];
  const parts = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size);
    const slice = clean.slice(start, end).trim();
    if (slice.length >= 15) parts.push(slice);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return parts;
}

export function chunkShadowPages(pages, source, category) {
  const chunks = [];
  let section = null;
  for (const page of pages || []) {
    if (!pageTextUsable(page.text)) continue;
    if (isLikelyReferencesText(page.text, { page: page.page, minPage: 3 })) continue;
    const segs = page.keptOld
      ? [{ section, text: page.text }]
      : segmentLinesBySection((page.lines || []).map((line) => line.text), section);
    if (segs.length) section = segs[segs.length - 1].section;
    const units = segs.length ? segs : [{ section, text: page.text }];
    for (const seg of units) {
      const parts = splitWindow(seg.text);
      for (let i = 0; i < parts.length; i++) {
        chunks.push({
          content: parts[i],
          metadata: {
            source,
            category,
            id: `${source}#${seg.section || "u"}#p${page.page}c${i}`,
            pageStart: page.page,
            pageEnd: page.page,
            chunkIndex: chunks.length,
            unit: "window",
            shadow: true,
            keptOld: !!page.keptOld,
            ...(seg.section ? { section: seg.section } : {}),
          },
        });
      }
    }
  }
  return chunks;
}

export function writeShadowDocument(shadowRoot, fileInfo, payload) {
  const target = shadowChunkPath(shadowRoot, fileInfo.category, fileInfo.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  assertInsideShadow(shadowRoot, tmp);
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, target);
  return target;
}

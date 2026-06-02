import { chromium } from "playwright";
import type { ProjectData } from "@/contracts/project";
import { formatClassification, formatKeywords } from "@/lib/paper-metadata";
import { parseMarkdownBlocks, MarkdownBlock } from "@/lib/markdown-parser";
import { normalizeMathDelimiters } from "@/lib/math-delimiter";
import { formatReference } from "@/lib/ref-format";
import katex from "katex";
import fs from "fs";
import path from "path";

import { BodySectionKey } from "@/lib/imrad";
import { stripOutOfRangeCitations } from "@/lib/reference-reorder";
import { markOutOfBoundsCitations } from "@/lib/citation-bounds";
import { cleanMarkdownArtifacts } from "@/lib/utils";
import { getTemplateSections, type TemplateSectionDef } from "@/lib/template-sections";

type PdfTemplate = "sci" | "ieee" | "gbt7713" | "nature" | "cas";

const CHINESE_TEMPLATES = new Set<PdfTemplate>(["gbt7713", "cas"]);

// KaTeX 官方 CSS（从 node_modules 读取，字体文件内联为 base64）
const katexCss = (() => {
  try {
    const katexDir = path.resolve(process.cwd(), "node_modules/katex/dist");
    let css = fs.readFileSync(path.join(katexDir, "katex.min.css"), "utf-8");
    // 将字体文件引用转换为 base64 内联
    css = css.replace(/url\(fonts\/([^)]+)\)/g, (_match, fontFile: string) => {
      try {
        const fontPath = path.join(katexDir, "fonts", fontFile);
        const fontData = fs.readFileSync(fontPath);
        const ext = path.extname(fontFile).slice(1);
        const mimeType = ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : "font/ttf";
        return `url(data:${mimeType};base64,${fontData.toString("base64")})`;
      } catch {
        return _match;
      }
    });
    return css;
  } catch {
    // fallback: 最小样式
    return ".katex{font-size:1em!important}.katex-display{display:block;margin:.5em 0;text-align:center}";
  }
})();

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const normalizeTemplate = (template: string): PdfTemplate => {
  if (["ieee", "gbt7713", "nature", "cas"].includes(template)) {
    return template as PdfTemplate;
  }
  return "sci";
};

const stripLeadingEnumeration = (line: string): string =>
  line.replace(/^([\d.]+|[一二三四五六七八九十]+[、.\s])\s*/, "");

/**
 * 将 $$...$$（显示）和 $...$（行内）公式渲染为 KaTeX HTML。
 * Tokenize 策略：先提取所有公式 → 替换为占位符 → HTML-escape 文本 → 替换回 KaTeX。
 * 避免 KaTeX HTML 被 escapeHtml 二次转义。
 */
const renderMathInline = (text: string): string => {
  const mathTokens: string[] = [];
  const TK = (i: number) => `%%M${i}%%`;

  let t = text;

  // Step 1: $$...$$ 显示公式
  t = t.replace(/(\$\$[\s\S]*?\$\$)/g, (_m, formula: string) => {
    const inner = formula.slice(2, -2).trim();
    if (!inner) return _m;
    try {
      mathTokens.push(katex.renderToString(inner, { displayMode: true, throwOnError: false, strict: false }));
    } catch {
      mathTokens.push(`<code>${escapeHtml(inner)}</code>`);
    }
    return TK(mathTokens.length - 1);
  });

  // Step 2: $...$ 行内公式（跳过纯数字）
  t = t.replace(/\$([^$]+)\$/g, (_m: string, formula: string) => {
    const inner = formula.trim();
    if (!inner || /^\d+$/.test(inner)) return _m;
    try {
      mathTokens.push(katex.renderToString(inner, { displayMode: false, throwOnError: false, strict: false }));
    } catch {
      mathTokens.push(`<code>${escapeHtml(inner)}</code>`);
    }
    return TK(mathTokens.length - 1);
  });

  // Step 2.5: 检测裸 LaTeX（已在 $...$ 内的已被 token 替换，不会误伤）
  // 裸 \command（如 \times, \cdot, \alpha 等）
  t = t.replace(/\\(?:times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|partial|nabla|infty|forall|exists|in|notin|subset|supset|cup|cap|emptyset|ldots|cdots|vdots|ddots|quad|qquad|text|mathrm|mathbf|mathit|mathcal|mathbb|frac|sum|int|prod|lim|sqrt|overline|underline|overbrace|underbrace|binom)(?:\{[^}]*\})*(?:[_^](?:\{[^}]*\}|[^_^{}]))*/g, (m: string) => {
    try {
      mathTokens.push(katex.renderToString(m, { displayMode: false, throwOnError: false, strict: false }));
    } catch {
      mathTokens.push(`<code>${escapeHtml(m)}</code>`);
    }
    return TK(mathTokens.length - 1);
  });
  // 带下标的变量（如 Y_{biochar}, x_i）
  t = t.replace(/(?<![A-Za-z])([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])(?:\^\{[^}]+\}|\^[A-Za-z0-9])?)/g, (m: string) => {
    try {
      mathTokens.push(katex.renderToString(m, { displayMode: false, throwOnError: false, strict: false }));
    } catch {
      mathTokens.push(`<code>${escapeHtml(m)}</code>`);
    }
    return TK(mathTokens.length - 1);
  });

  // Step 3: HTML-escape 非公式文本
  t = escapeHtml(t);

  // Step 4: 替换占位符回 KaTeX HTML
  t = t.replace(/%%M(\d+)%%/g, (_m, idx: string) => mathTokens[parseInt(idx, 10)] || _m);

  // Step 5: 基础 Markdown 格式化
  return t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
};

const inlineMarkdown = (text: string): string => renderMathInline(text);

const paragraphHtml = (lines: string[]): string => {
  // 使用占位符避免 <br /> 被 renderMathInline 内的 escapeHtml 转义
  const joined = inlineMarkdown(lines.join("§§BR§§"));
  return `<p>${joined.replace(/§§BR§§/g, "<br />")}</p>`;
};

const renderTableBlock = (block: MarkdownBlock): string => {
  const cells = block.lines.map(l => l.split("|").map(c => c.trim()));
  const hasHeader = cells.length >= 2 && /^[\s|:\-]+$/.test(cells[1].join("|"));
  const headerRow = hasHeader ? 0 : -1;
  const dataStart = hasHeader ? 2 : 0;
  // 细线分隔风格：仅表头下方有线，无边框
  let html = '<table style="width:100%;margin:10px 0;font-size:9pt;border-collapse:collapse;">';
  if (headerRow >= 0) {
    html += '<thead><tr style="border-bottom:1px solid #333;">';
    for (const cell of cells[headerRow]) {
      html += `<th style="padding:4px 8px;text-align:left;font-weight:600;">${inlineMarkdown(cell)}</th>`;
    }
    html += '</tr></thead>';
  }
  html += '<tbody>';
  for (let i = dataStart; i < cells.length; i++) {
    html += '<tr>';
    for (const cell of cells[i]) {
      html += `<td style="padding:4px 8px;text-align:left;">${inlineMarkdown(cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
};

const renderImageBlock = (block: MarkdownBlock): string => {
  const caption = inlineMarkdown(block.caption || "");
  const url = block.url || "";

  // File-based chart image — 兼容新旧两种路径
  const isOldPath = url.startsWith("/charts/");
  const isNewPath = url.startsWith("/api/charts/");
  if (isOldPath || isNewPath) {
    const filename = isOldPath ? url.slice("/charts/".length) : url.slice("/api/charts/".length);
    // 新路径优先从 data/charts/ 读取，旧路径从 public/charts/ 读取
    const candidates = isNewPath
      ? [path.join(process.cwd(), "data", "charts", filename), path.join(process.cwd(), "public", "charts", filename)]
      : [path.join(process.cwd(), "public", url)];
    const filePath = candidates.find(p => fs.existsSync(p)) ?? candidates[0];
    try {
      const buf = fs.readFileSync(filePath);
      const imgSrc = `data:image/png;base64,${buf.toString("base64")}`;
      return `<figure style="text-align:center;margin:16px 0;"><img src="${imgSrc}" alt="${caption}" style="max-width:90%;height:auto;border:1px solid #eee;border-radius:4px;" />${caption ? `<figcaption style="margin-top:6px;font-size:9pt;color:#555;">${caption}</figcaption>` : ""}</figure>`;
    } catch {
      return `<p style="color:#999;font-style:italic;">[图片: ${caption}]</p>`;
    }
  }

  // Base64 inline image
  const imgB64Match = url.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (imgB64Match) {
    return `<figure style="text-align:center;margin:16px 0;"><img src="${url}" alt="${caption}" style="max-width:90%;height:auto;border:1px solid #eee;border-radius:4px;" />${caption ? `<figcaption style="margin-top:6px;font-size:9pt;color:#555;">${caption}</figcaption>` : ""}</figure>`;
  }

  return `<p style="color:#999;font-style:italic;">[图片: ${caption}]</p>`;
};

/** GB/T 7713 顶层章节标题 — 子标题中出现这些文本时视为冲突，应跳过 */
const GBT_RESERVED_HEADINGS = new Set(["引言", "材料与方法", "结果与分析", "结论", "摘要", "参考文献", "Materials and Methods", "Results and Discussion", "Introduction", "Conclusion", "Abstract", "References"]);

const renderMarkdown = (content: string, sectionNumber?: number, compact = false): string => {
  // 剥离系统内部占位符（越界引用标记），不输出到 PDF
  let preprocessed = content.replace(/\[引用\?\]/g, "");
  // 剥离未渲染的 FIGURE JSON 标记 → 替换为图片引用文字
  preprocessed = preprocessed.replace(/【FIGURE:\{[^】]*\}】/g, (_m: string) => {
    try {
      const json = _m.slice(8, -1); // extract {...}
      const parsed = JSON.parse(json);
      const cap = parsed.caption || parsed.config?.caption || "";
      return cap ? `[图片: ${cap}]` : "[图片]";
    } catch { return "[图片]"; }
  });
  // 剥离插图占位符（含常见笔误变体）
  preprocessed = preprocessed.replace(/【插[图画]占[位位]：[^】]*】/g, "");
  // 剥离"待补充数据"占位
  preprocessed = preprocessed.replace(/（待补充数据）/g, "");
  // 剥离 Verifier 内联审稿备注（以审稿特征词开头的整句）
  preprocessed = preprocessed.replace(
    /(?:需要注意的是，|若需确证|应在后续修改中|需在后续修改中|此处应|建议在)\s*[^。；\n]{20,}[。；]/g,
    ""
  );
  let normalized = normalizeMathDelimiters(preprocessed);
  // 包裹以反斜杠开头的独立公式行（AI 可能输出未包裹的 LaTeX）
  normalized = normalized.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("$")) return line;
    // 包含 \frac, \times 等 LaTeX 命令且不在 $ 内 → 包裹为行内公式
    if (/\\[a-zA-Z]+/.test(trimmed) && !trimmed.includes("$")) {
      return `$${trimmed}$`;
    }
    return line;
  }).join("\n");
  const blocks = parseMarkdownBlocks(normalized);
  const html: string[] = [];
  let h2Counter = 0;
  let h3Counter = 0;

  for (const block of blocks) {
    switch (block.type) {
      case "blank":
        break;

      case "paragraph":
        html.push(compact
          ? `<span>${inlineMarkdown(block.lines.join(" "))}</span>`
          : paragraphHtml(block.lines));
        break;

      case "heading": {
        const level = block.level ?? 2;
        let title = stripLeadingEnumeration(block.title ?? "");
        // 跳过与顶层章节标题冲突的子标题（如 Results 中出现 "材料与方法"）
        if (GBT_RESERVED_HEADINGS.has(title.trim())) break;
        if (sectionNumber && (level === 2 || level === 3)) {
          h2Counter += 1;
          h3Counter = 0;
          title = `${sectionNumber}.${h2Counter} ${title}`;
          html.push(`<h3>${inlineMarkdown(title)}</h3>`);
        } else if (sectionNumber && level === 4) {
          h3Counter += 1;
          title = `${sectionNumber}.${h2Counter}.${h3Counter} ${title}`;
          html.push(`<h4>${inlineMarkdown(title)}</h4>`);
        } else if (!compact) {
          html.push(`<p><strong>${inlineMarkdown(title)}</strong></p>`);
        } else {
          html.push(`<span>${inlineMarkdown(title)}</span>`);
        }
        break;
      }

      case "bullet-list":
        html.push(`<ul>${block.lines.map(l => `<li>${inlineMarkdown(l)}</li>`).join("")}</ul>`);
        break;

      case "ordered-list":
        html.push(`<ol>${block.lines.map(l => `<li>${inlineMarkdown(l)}</li>`).join("")}</ol>`);
        break;

      case "table":
        html.push(renderTableBlock(block));
        break;

      case "image":
        html.push(renderImageBlock(block));
        break;
    }
  }

  return html.join("\n");
};

const section = (project: ProjectData, key: BodySectionKey): string => project.sections[key] || "";

/** 获取 section 内容，合并 mergeKeys（如 results + discussion） */
const sectionWithMerge = (project: ProjectData, def: TemplateSectionDef): string => {
  const main = project.sections[def.key] || "";
  if (!def.mergeKeys || def.mergeKeys.length === 0) return main;
  const merged = def.mergeKeys
    .map(mk => project.sections[mk] || "")
    .filter(Boolean)
    .join("\n\n");
  return merged ? `${main}\n\n${merged}` : main;
};

const referencesHtml = (references: string[] | undefined, isChinese: boolean): string => {
  const body = references?.length
    ? references.map((ref, index) => {
        const formatted = formatReference(ref, { style: "gbt7714" });
        // GB/T 7714-2015: 编号用方括号，后跟空格
        return `<p>[${index + 1}] ${inlineMarkdown(formatted)}</p>`;
      }).join("")
    : `<p class="muted">${isChinese ? "暂无引用文献，请在扩写时通过 AI 自动引入。" : "No references cited yet. References will be added automatically during AI writing."}</p>`;

  return `
    <section class="references">
      <h2>${isChinese ? "参考文献：" : "References"}</h2>
      <div>${body}</div>
    </section>
  `;
};

const pageMargins: Record<string, string> = {
  sci: "25mm 20mm",
  ieee: "18mm 15mm",
  gbt7713: "25mm 20mm",
  nature: "18mm 17mm",
  cas: "25mm 20mm",
};

const baseCss = (template: string) => `
  @page {
    size: A4;
    margin: ${pageMargins[template] || "25mm 20mm"};
  }

  * {
    box-sizing: border-box;
    color: #111;
  }

  body {
    margin: 0;
    padding: 0;
    background: #fff;
    text-rendering: geometricPrecision;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .paper {
    width: 100%;
    min-height: 297mm;
    background: #fff;
  }

  p {
    margin: 0 0 10px;
    text-align: justify;
    text-justify: inter-ideograph;
    word-break: normal;
    overflow-wrap: break-word;
    hyphens: auto;
    orphans: 3;
    widows: 3;
  }

  ul,
  ol {
    margin: 0 0 10px 20px;
    padding: 0;
  }

  li {
    margin: 0 0 4px;
    text-align: justify;
    text-justify: inter-ideograph;
  }

  h1,
  h2,
  h3,
  h4 {
    break-after: avoid;
  }

  h3 {
    margin: 14px 0 7px;
    font-size: 11pt;
    line-height: 1.3;
    font-weight: 700;
  }

  h4 {
    margin: 10px 0 5px;
    font-size: 9.8pt;
    line-height: 1.3;
    font-weight: 700;
    font-style: italic;
  }

  section {
    break-inside: auto;
  }

  .references {
    margin-top: 30px;
    padding-top: 18px;
    border-top: 1px solid #ddd;
  }

  .references p {
    margin-bottom: 5px;
  }

  .muted {
    color: #666;
    font-style: italic;
  }
`;

const standardSciHtml = (project: ProjectData): string => {
  const templateDefs = getTemplateSections("sci");
  const bodyHtml = templateDefs.map(def =>
    sciSection(def.sectionNumber, def.label, sectionWithMerge(project, def))
  ).join("\n");

  return `
    <article class="paper sci">
      <header>
        <h1>${inlineMarkdown(project.title || "Untitled Research Paper")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "Author Name Not Set")}</p>
        <p class="affiliations">${inlineMarkdown(project.affiliations || "Agricultural Science Laboratory, Research Institute of Agriculture, 2024")}</p>
      </header>

      <section class="abstract">
        <h2>Abstract</h2>
        <div>${renderMarkdown(project.abstract || "Abstract content will appear here after generation.")}</div>
      </section>

      <p class="keywords"><strong>Keywords: </strong>${inlineMarkdown(formatKeywords(project, "en") || "Keywords will appear here after generation.")}</p>

      ${bodyHtml}
      ${referencesHtml(project.references, false)}
    </article>
  `;
};

const sciSection = (number: number, title: string, content: string): string => `
  <section class="sci-section">
    <h2><span>${number}</span>${title}</h2>
    <div>${renderMarkdown(content, number)}</div>
  </section>
`;

const ROMAN = ["I", "II", "III", "IV", "V", "VI"] as const;

const ieeeHtml = (project: ProjectData): string => {
  const templateDefs = getTemplateSections("ieee");
  const bodyHtml = templateDefs.map(def =>
    ieeeSection(`${ROMAN[def.sectionNumber - 1] || def.sectionNumber}.`, def.label, sectionWithMerge(project, def), def.sectionNumber)
  ).join("\n");

  return `
    <article class="paper ieee">
      <header>
        <h1>${inlineMarkdown(project.title || "Untitled Paper")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "")}</p>
      </header>

      <section class="ieee-abstract">
        <p><strong><em>Abstract—</em></strong><span>${renderMarkdown(project.abstract || "Abstract content...", undefined, true)}</span></p>
        <p><strong><em>Keywords—</em></strong>${inlineMarkdown(formatKeywords(project, "en"))}.</p>
      </section>

      <div class="columns">
        ${bodyHtml}
      </div>
      ${referencesHtml(project.references, false)}
    </article>
  `;
};

const ieeeSection = (number: string, title: string, content: string, secNum: number): string => `
  <section>
    <h2>${number} ${title}</h2>
    <div>${renderMarkdown(content, secNum)}</div>
  </section>
`;

const gbtHtml = (project: ProjectData): string => {
  const classification = formatClassification(project);
  const sections = getTemplateSections("gbt7713");

  const bodyHtml = sections.map(def =>
    gbtSection(def.sectionNumber, def.label, sectionWithMerge(project, def))
  ).join("\n");

  return `
    <article class="paper gbt">
      <header>
        <h1>${inlineMarkdown(project.title || "无标题论文")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "作者姓名")}</p>
        <p class="affiliations">（${inlineMarkdown(project.affiliations || "作者单位信息")}）</p>
      </header>

      <section class="gbt-meta">
        <p><strong>摘要：</strong>${renderMarkdown((project.abstract || "摘要内容...").replace(/^摘要[：:]\s*/, ""), undefined, true)}</p>
        <p><strong>关键词：</strong>${inlineMarkdown(formatKeywords(project, "zh"))}</p>
        ${classification ? `<p class="clc"><strong>中图分类号：</strong>${inlineMarkdown(classification)}</p>` : ""}
      </section>

      ${bodyHtml}
      ${referencesHtml(project.references, true)}
    </article>
  `;
};

const gbtSection = (number: number, title: string, content: string): string => `
  <section>
    <h2>${number} ${title}</h2>
    <div>${renderMarkdown(content, number)}</div>
  </section>
`;

const natureHtml = (project: ProjectData): string => {
  const templateDefs = getTemplateSections("nature");
  const introDef = templateDefs.find(d => d.key === "introduction");
  const resultsDef = templateDefs.find(d => d.key === "results");
  const methodsDef = templateDefs.find(d => d.key === "methods");
  const discussionDef = templateDefs.find(d => d.key === "discussion");

  return `
    <article class="paper nature">
      <header>
        <h1>${inlineMarkdown(project.title || "Untitled Nature Article")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "")}</p>
      </header>

      <section class="nature-abstract">
        ${renderMarkdown(project.abstract || "Abstract without heading, as per Nature style.")}
      </section>

      <div class="columns">
        <div>
          ${introDef ? `<section class="lead">${renderMarkdown(sectionWithMerge(project, introDef))}</section>` : ""}
          ${resultsDef ? `<section><h2>${resultsDef.label}</h2>${renderMarkdown(sectionWithMerge(project, resultsDef))}</section>` : ""}
        </div>
        <div>
          ${methodsDef ? `<section><h2>${methodsDef.label}</h2><div class="methods-box">${renderMarkdown(sectionWithMerge(project, methodsDef))}</div></section>` : ""}
          ${discussionDef ? `<section><h2>${discussionDef.label}</h2>${renderMarkdown(sectionWithMerge(project, discussionDef))}</section>` : ""}
        </div>
      </div>
      ${referencesHtml(project.references, false)}
    </article>
  `;
};

const casHtml = (project: ProjectData): string => {
  const templateDefs = getTemplateSections("cas");
  const bodyHtml = templateDefs.map(def =>
    casSection(def.sectionNumber, def.label, sectionWithMerge(project, def))
  ).join("\n");

  return `
    <article class="paper cas">
      <header>
        <h1>${inlineMarkdown(project.title || "中国科学院学术论文模板")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "")}</p>
        <p class="affiliations">（${inlineMarkdown(project.affiliations || "中国科学院农业资源研究中心，石家庄 050021")}）</p>
      </header>

      <section class="cas-abstract">
        <p><strong>摘要：</strong>${renderMarkdown((project.abstract || "").replace(/^摘要[：:]\s*/, ""), undefined, true)}</p>
        <p><strong>关键词：</strong>${inlineMarkdown(formatKeywords(project, "zh"))}</p>
      </section>

      ${bodyHtml}
      ${referencesHtml(project.references, true)}
    </article>
  `;
};

const casSection = (number: number, title: string, content: string): string => `
  <section>
    <h2>${number} ${title}</h2>
    <div>${renderMarkdown(content, number)}</div>
  </section>
`;

const templateCss = `
  .sci {
    padding: 0;
    font-family: "Times New Roman", Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.68;
    word-spacing: normal;
    letter-spacing: normal;
  }

  .sci header {
    text-align: center;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 1px solid #222;
  }

  .sci h1 {
    margin: 0 0 16px;
    font-size: 24pt;
    line-height: 1.18;
    font-weight: 700;
    text-transform: uppercase;
  }

  .sci .authors {
    margin-bottom: 4px;
    font-size: 12pt;
    font-weight: 600;
    text-align: center;
  }

  .sci .affiliations {
    font-size: 9pt;
    color: #666;
    font-style: italic;
    text-align: center;
  }

  .sci .abstract {
    margin-bottom: 24px;
    break-inside: avoid;
  }

  .sci .abstract h2 {
    display: inline-block;
    margin: 0 0 10px;
    padding-bottom: 3px;
    border-bottom: 2px solid #111;
    font-size: 13pt;
    text-transform: uppercase;
  }

  .sci-section {
    margin-bottom: 20px;
  }

  .sci-section h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 12pt;
    text-transform: uppercase;
  }

  .sci-section h2 span {
    display: inline-block;
    min-width: 17px;
    padding: 1px 6px;
    background: #111;
    color: #fff;
    font-size: 10pt;
    text-align: center;
  }

  /* ── IEEE ── */
  .ieee {
    padding: 0;
    font-family: "Times New Roman", Georgia, serif;
    font-size: 9pt;
    line-height: 1.24;
    word-spacing: normal;
    letter-spacing: normal;
    color: #000;
  }

  .ieee header {
    text-align: center;
    margin-bottom: 22px;
  }

  .ieee h1 {
    margin: 0 0 20px;
    font-size: 24pt;
    line-height: 1.12;
    font-weight: 400;
    letter-spacing: -0.3pt;
  }

  .ieee .authors {
    text-align: center;
    font-size: 11pt;
    margin-bottom: 12px;
    line-height: 1.3;
  }

  .ieee-abstract {
    margin-bottom: 16px;
    break-inside: avoid;
  }

  .ieee-abstract p {
    margin-bottom: 6px;
    line-height: 1.22;
    text-indent: 0;
  }

  .ieee .columns {
    columns: 2;
    column-gap: 20px;
    column-rule: none;
  }

  .ieee .columns section {
    break-inside: auto;
  }

  .ieee h2 {
    margin: 16px 0 8px;
    font-size: 10pt;
    font-weight: 400;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1pt;
  }

  .ieee h3 {
    margin: 10px 0 5px;
    font-size: 9pt;
    font-weight: 600;
    font-style: italic;
  }

  .ieee h4 {
    margin: 8px 0 4px;
    font-size: 9pt;
    font-weight: 600;
    font-style: italic;
  }

  .ieee p {
    margin-bottom: 6px;
    line-height: 1.22;
    text-indent: 1em;
  }

  .ieee section p:first-of-type {
    text-indent: 0;
  }

  .ieee ul,
  .ieee ol {
    margin-left: 1.5em;
  }

  .nature .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 22px;
    align-items: start;
  }

  /* ── GB/T 7713 国标 ── */
  .gbt {
    padding: 0;
    font-family: "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif;
    font-size: 10.5pt;
    line-height: 1.7;
    color: #000;
  }

  .gbt header {
    text-align: center;
    margin-bottom: 28px;
  }

  .gbt h1 {
    margin: 0 0 18px;
    font-family: "SimHei", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: 0.5pt;
  }

  .gbt .authors {
    margin-bottom: 6px;
    text-align: center;
    font-size: 12pt;
    line-height: 1.5;
  }

  .gbt .affiliations {
    margin-bottom: 24px;
    text-align: center;
    font-size: 9pt;
    color: #444;
    line-height: 1.4;
  }

  .gbt-meta {
    margin-bottom: 24px;
    padding: 14px 16px;
    border-top: 1px solid #ccc;
    border-bottom: 1px solid #ccc;
    background: #fafafa;
    break-inside: avoid;
  }

  .gbt-meta p {
    margin-bottom: 6px;
    text-indent: 0;
    line-height: 1.65;
  }

  .gbt-meta .clc {
    font-size: 9pt;
    color: #555;
  }

  .gbt h2 {
    margin: 22px 0 12px;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
    font-family: "SimHei", "Microsoft YaHei", sans-serif;
    font-size: 12pt;
    font-weight: 700;
    line-height: 1.4;
  }

  .gbt h3 {
    margin: 14px 0 8px;
    font-family: "SimHei", "Microsoft YaHei", sans-serif;
    font-size: 10.5pt;
    font-weight: 700;
    line-height: 1.4;
  }

  .gbt h4 {
    margin: 10px 0 6px;
    font-family: "SimHei", "Microsoft YaHei", sans-serif;
    font-size: 10.5pt;
    font-weight: 600;
    font-style: italic;
    line-height: 1.4;
  }

  .gbt section p {
    text-indent: 2em;
    margin-bottom: 4px;
    line-height: 1.7;
  }

  .gbt section ul,
  .gbt section ol {
    margin-left: 2em;
  }

  .gbt section li {
    text-indent: 0;
    margin-bottom: 2px;
  }

  .nature {
    padding: 0;
    font-family: "Times New Roman", Georgia, serif;
    font-size: 10pt;
    line-height: 1.28;
  }

  .nature header {
    margin-bottom: 24px;
  }

  .nature h1 {
    margin: 0 0 14px;
    font-size: 28pt;
    line-height: 1.08;
    font-weight: 700;
  }

  .nature .authors {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid #111;
    font-size: 11pt;
    font-weight: 700;
    text-align: left;
  }

  .nature-abstract {
    margin-bottom: 20px;
    font-size: 11pt;
    line-height: 1.45;
    font-weight: 700;
  }

  .nature .lead p:first-child::first-letter {
    float: left;
    margin: 0 5px 0 0;
    font-size: 30pt;
    line-height: 0.85;
    font-weight: 700;
  }

  .nature h2 {
    margin: 14px 0 8px;
    padding-top: 9px;
    border-top: 1px solid #111;
    font-size: 12pt;
    font-weight: 700;
  }

  .nature .methods-box {
    padding: 12px;
    background: #f5f5f5;
    font-size: 9pt;
  }

  .cas {
    padding: 0;
    font-family: "SimSun", "Microsoft YaHei", "Noto Sans CJK SC", serif;
    font-size: 10.5pt;
    line-height: 1.78;
  }

  .cas header {
    text-align: center;
    margin-bottom: 30px;
  }

  .cas h1 {
    margin: 0 0 16px;
    font-size: 18pt;
    font-weight: 700;
  }

  .cas .authors {
    text-align: center;
    font-size: 12pt;
  }

  .cas .affiliations {
    text-align: center;
    font-size: 10pt;
    font-style: italic;
  }

  .cas-abstract {
    margin-bottom: 24px;
    padding: 14px 16px;
    border-top: 1px solid #ddd;
    border-bottom: 1px solid #ddd;
    background: #f7f7f7;
    break-inside: avoid;
  }

  .cas-abstract p {
    margin-bottom: 5px;
    text-indent: 0;
  }

  .cas h2 {
    margin: 20px 0 10px;
    padding-left: 10px;
    border-left: 4px solid #111;
    font-size: 14pt;
    font-weight: 700;
  }

  .cas section > div p {
    text-indent: 2em;
  }

  .sci .references h2,
  .ieee .references h2,
  .nature .references h2 {
    margin: 0 0 10px;
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
  }

  .gbt .references h2,
  .cas .references h2 {
    margin: 0 0 10px;
    font-size: 10.5pt;
    font-weight: 700;
  }

  .references p {
    text-indent: 0 !important;
    font-size: 9pt;
    line-height: 1.35;
  }
`;

const renderTemplate = (project: ProjectData, template: PdfTemplate): string => {
  switch (template) {
    case "ieee":
      return ieeeHtml(project);
    case "gbt7713":
      return gbtHtml(project);
    case "nature":
      return natureHtml(project);
    case "cas":
      return casHtml(project);
    default:
      return standardSciHtml(project);
  }
};

export function renderProjectPdfHtml(project: ProjectData): string {
  const template = normalizeTemplate(project.template);
  const isChinese = CHINESE_TEMPLATES.has(template);

  // 导出保留全部引用（不剪枝），仅清理 Markdown 残余 + 越界引用
  const refs = project.references || [];
  const refCount = refs.length;

  const cleanSections: Record<string, string> = {};
  for (const [key, content] of Object.entries(project.sections)) {
    const { cleaned } = markOutOfBoundsCitations(content || "", refCount);
    cleanSections[key] = cleanMarkdownArtifacts(cleaned);
  }

  const { cleaned: cleanAbstract } = markOutOfBoundsCitations(project.abstract || "", refCount);

  // 清理作者和单位占位符
  const cleanPlaceholder = (s: string) =>
    s?.replace(/【请填写作者姓名】/g, "")?.replace(/【作者信息待填写】/g, "")?.trim() || "";

  const cleanProject: ProjectData = {
    ...project,
    title: cleanMarkdownArtifacts(project.title || ""),
    authors: cleanPlaceholder(project.authors || ""),
    affiliations: cleanPlaceholder(project.affiliations || ""),
    abstract: cleanMarkdownArtifacts(cleanAbstract),
    sections: cleanSections as ProjectData["sections"],
    references: refs,
  };

  return `<!doctype html>
    <html lang="${isChinese ? "zh-CN" : "en"}">
      <head>
        <meta charset="utf-8" />
        <style>${katexCss}</style>
        <style>${baseCss(template)}${templateCss}</style>
      </head>
      <body>${renderTemplate(cleanProject, template)}</body>
    </html>`;
}

export async function renderProjectPdf(project: ProjectData): Promise<Uint8Array> {
  const browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.setContent(renderProjectPdfHtml(project), {
      waitUntil: "networkidle",
    });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return pdf;
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

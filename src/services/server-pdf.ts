import { chromium } from "playwright";
import type { ProjectData } from "@/lib/store";
import { formatClassification, formatKeywords } from "@/lib/paper-metadata";

type PdfTemplate = "sci" | "ieee" | "gbt7713" | "nature" | "cas";
type SectionKey = "introduction" | "methods" | "results" | "conclusion";

const CHINESE_TEMPLATES = new Set<PdfTemplate>(["gbt7713", "cas"]);

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

const inlineMarkdown = (text: string): string =>
  escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");

const paragraphHtml = (lines: string[]): string =>
  `<p>${inlineMarkdown(lines.join("<br />"))}</p>`;

const renderMarkdown = (content: string, sectionNumber?: number, compact = false): string => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let ordered = false;
  let h2Counter = 0;
  let h3Counter = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(compact ? `<span>${inlineMarkdown(paragraph.join(" "))}</span>` : paragraphHtml(paragraph));
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<${ordered ? "ol" : "ul"}>${listItems.join("")}</${ordered ? "ol" : "ul"}>`);
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();

      const level = heading[1].length;
      let title = stripLeadingEnumeration(heading[2].trim());
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
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listItems.length > 0 && ordered) flushList();
      ordered = false;
      listItems.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listItems.length > 0 && !ordered) flushList();
      ordered = true;
      listItems.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return html.join("\n");
};

const section = (project: ProjectData, key: SectionKey): string => project.sections[key] || "";

const referencesHtml = (references: string[] | undefined, isChinese: boolean): string => {
  const body = references?.length
    ? references.map((ref, index) => `<p>[${index + 1}] ${inlineMarkdown(ref)}</p>`).join("")
    : `<p class="muted">${isChinese ? "暂无引用文献，请在扩写时通过 AI 自动引入。" : "No references cited yet. References will be added automatically during AI writing."}</p>`;

  return `
    <section class="references">
      <h2>${isChinese ? "参考文献：" : "References"}</h2>
      <div>${body}</div>
    </section>
  `;
};

const baseCss = `
  @page {
    size: A4;
    margin: 0;
  }

  * {
    box-sizing: border-box;
    color: #111;
  }

  body {
    margin: 0;
    background: #fff;
    text-rendering: geometricPrecision;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .paper {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #fff;
  }

  p {
    margin: 0 0 10px;
    text-align: justify;
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

const standardSciHtml = (project: ProjectData): string => `
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

    ${sciSection(1, "Introduction", section(project, "introduction"))}
    ${sciSection(2, "Materials and Methods", section(project, "methods"))}
    ${sciSection(3, "Results and Discussion", section(project, "results"))}
    ${sciSection(4, "Conclusion", section(project, "conclusion"))}
    ${referencesHtml(project.references, false)}
  </article>
`;

const sciSection = (number: number, title: string, content: string): string => `
  <section class="sci-section">
    <h2><span>${number}</span>${title}</h2>
    <div>${renderMarkdown(content, number)}</div>
  </section>
`;

const ieeeHtml = (project: ProjectData): string => `
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
      ${ieeeSection("I.", "Introduction", section(project, "introduction"))}
      ${ieeeSection("II.", "Materials and Methods", section(project, "methods"))}
      ${ieeeSection("III.", "Results", section(project, "results"))}
      ${ieeeSection("IV.", "Conclusion", section(project, "conclusion"))}
    </div>
    ${referencesHtml(project.references, false)}
  </article>
`;

const ieeeSection = (number: string, title: string, content: string): string => `
  <section>
    <h2>${number} ${title}</h2>
    <div>${renderMarkdown(content)}</div>
  </section>
`;

const gbtHtml = (project: ProjectData): string => {
  const classification = formatClassification(project);

  return `
    <article class="paper gbt">
      <header>
        <h1>${inlineMarkdown(project.title || "无标题论文")}</h1>
        <p class="authors">${inlineMarkdown(project.authors || "作者姓名")}</p>
        <p class="affiliations">（${inlineMarkdown(project.affiliations || "作者单位信息")}）</p>
      </header>

      <section class="gbt-meta">
        <p><strong>摘要：</strong>${renderMarkdown(project.abstract || "摘要内容...", undefined, true)}</p>
        <p><strong>关键词：</strong>${inlineMarkdown(formatKeywords(project, "zh"))}</p>
        ${classification ? `<p class="clc"><strong>中图分类号：</strong>${inlineMarkdown(classification)}</p>` : ""}
      </section>

      ${gbtSection(1, "引言", section(project, "introduction"))}
      ${gbtSection(2, "材料与方法", section(project, "methods"))}
      ${gbtSection(3, "结果与分析", section(project, "results"))}
      ${gbtSection(4, "结论", section(project, "conclusion"))}
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

const natureHtml = (project: ProjectData): string => `
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
        <section class="lead">${renderMarkdown(section(project, "introduction"))}</section>
        <section>
          <h2>Results</h2>
          ${renderMarkdown(section(project, "results"))}
        </section>
      </div>
      <div>
        <section>
          <h2>Methods</h2>
          <div class="methods-box">${renderMarkdown(section(project, "methods"))}</div>
        </section>
        <section>
          <h2>Discussion</h2>
          ${renderMarkdown(section(project, "conclusion"))}
        </section>
      </div>
    </div>
    ${referencesHtml(project.references, false)}
  </article>
`;

const casHtml = (project: ProjectData): string => `
  <article class="paper cas">
    <header>
      <h1>${inlineMarkdown(project.title || "中国科学院学术论文模板")}</h1>
      <p class="authors">${inlineMarkdown(project.authors || "")}</p>
      <p class="affiliations">（${inlineMarkdown(project.affiliations || "中国科学院农业资源研究中心，石家庄 050021")}）</p>
    </header>

    <section class="cas-abstract">
      <p><strong>摘要：</strong>${renderMarkdown(project.abstract || "", undefined, true)}</p>
      <p><strong>关键词：</strong>${inlineMarkdown(formatKeywords(project, "zh"))}</p>
    </section>

    ${casSection(1, "引言", section(project, "introduction"))}
    ${casSection(2, "研究方法", section(project, "methods"))}
    ${casSection(3, "结果与讨论", section(project, "results"))}
    ${referencesHtml(project.references, true)}
  </article>
`;

const casSection = (number: number, title: string, content: string): string => `
  <section>
    <h2>${number} ${title}</h2>
    <div>${renderMarkdown(content, number)}</div>
  </section>
`;

const templateCss = `
  .sci {
    padding: 20mm 18mm;
    font-family: "Times New Roman", Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.68;
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

  .ieee {
    padding: 16mm 15mm;
    font-family: "Times New Roman", Georgia, serif;
    font-size: 9pt;
    line-height: 1.18;
  }

  .ieee header {
    text-align: center;
    margin-bottom: 20px;
  }

  .ieee h1 {
    margin: 0 0 18px;
    font-size: 24pt;
    line-height: 1.1;
    font-weight: 400;
  }

  .ieee .authors {
    text-align: center;
    font-size: 11pt;
    margin-bottom: 10px;
  }

  .ieee-abstract {
    margin-bottom: 14px;
    break-inside: avoid;
  }

  .ieee-abstract p {
    margin-bottom: 6px;
  }

  .nature .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 22px;
    align-items: start;
  }

  .ieee .columns {
    columns: 2;
    column-gap: 22px;
  }

  .ieee h2 {
    margin: 14px 0 7px;
    font-size: 10pt;
    font-weight: 400;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .ieee p {
    margin-bottom: 6px;
    line-height: 1.22;
    text-indent: 1em;
  }

  .gbt {
    padding: 20mm;
    font-family: "SimSun", "Microsoft YaHei", "Noto Sans CJK SC", serif;
    font-size: 10.5pt;
    line-height: 1.62;
  }

  .gbt header {
    text-align: center;
    margin-bottom: 22px;
  }

  .gbt h1 {
    margin: 0 0 15px;
    font-family: "Microsoft YaHei", "SimHei", sans-serif;
    font-size: 16pt;
    font-weight: 700;
  }

  .gbt .authors {
    margin-bottom: 5px;
    text-align: center;
    font-size: 12pt;
  }

  .gbt .affiliations {
    margin-bottom: 18px;
    text-align: center;
    font-size: 9pt;
    color: #555;
  }

  .gbt-meta {
    margin-bottom: 22px;
    break-inside: avoid;
  }

  .gbt-meta p {
    margin-bottom: 5px;
    text-indent: 0;
  }

  .gbt-meta .clc {
    font-size: 9pt;
  }

  .gbt h2 {
    margin: 20px 0 10px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
    font-size: 12pt;
    font-weight: 700;
  }

  .gbt section > div p {
    text-indent: 2em;
  }

  .nature {
    padding: 18mm 17mm;
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
    padding: 20mm 18mm;
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

  return `<!doctype html>
    <html lang="${isChinese ? "zh-CN" : "en"}">
      <head>
        <meta charset="utf-8" />
        <style>${baseCss}${templateCss}</style>
      </head>
      <body>${renderTemplate(project, template)}</body>
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

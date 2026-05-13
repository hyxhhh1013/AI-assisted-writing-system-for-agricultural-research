import { useCallback } from "react";
import { toast } from "sonner";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { ProjectData } from "@/lib/store";
import { mergeEditorIntoProject, stripHtmlToPlainForDocx } from "@/lib/export-content";
import { formatKeywords } from "@/lib/paper-metadata";

interface UseDocxExportOptions {
  project: ProjectData;
  activeSection: string;
  editingContent: string;
  saveProject: () => Promise<void>;
}

export function useDocxExport({ project, activeSection, editingContent, saveProject }: UseDocxExportOptions) {
  return useCallback(async () => {
    if (!project) return;

    await saveProject();
    const p = mergeEditorIntoProject(project, activeSection, editingContent);

    const template = p.template || "sci";
    const isChinese = template === "gbt7713";
    const isNature = template === "nature";
    const isIEEE = template === "ieee";

    const config = {
      fontMain: isChinese ? "SimSun" : "Times New Roman",
      fontHeading: isChinese ? "SimHei" : (isIEEE ? "Arial" : "Times New Roman"),
      titleSize: isChinese ? 44 : (isNature ? 36 : 32),
      heading1Size: isChinese ? 28 : (isNature ? 24 : 22),
      bodySize: isChinese ? 24 : (isNature ? 22 : 21),
      lineSpacing: isChinese ? 360 : (isNature ? 300 : 240),
      indent: isChinese ? 420 : 0,
    };

    const parseMarkdownToRuns = (text: string, options: { font?: string; size?: number; color?: string } = {}): TextRun[] => {
      if (!text) return [new TextRun({ text: "", ...options })];
      const imgMatch = text.match(/^!\[([^\]]*)\]\([^)]+\)$/);
      if (imgMatch) return [new TextRun({ text: `[图片: ${imgMatch[1] || "chart"}]`, italics: true, color: "888888", ...options })];

      const runs: TextRun[] = [];
      const parts = text.split(/(\*\*.*?\*\*)/g);
      parts.forEach(part => {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: options.font || config.fontMain, size: options.size || config.bodySize, color: options.color }));
        } else {
          const lines = part.split("\n");
          lines.forEach((line, i) => {
            runs.push(new TextRun({ text: line, font: options.font || config.fontMain, size: options.size || config.bodySize, color: options.color }));
            if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
          });
        }
      });
      return runs;
    };

    const refParagraphs = (p.references && p.references.length > 0)
      ? p.references.map((ref, idx) =>
          new Paragraph({
            children: [new TextRun({ text: `[${idx + 1}] ${ref}`, size: isChinese ? 18 : 16, font: config.fontMain })],
            spacing: { after: 100 },
            alignment: AlignmentType.LEFT,
          })
        )
      : [
          new Paragraph({
            children: [new TextRun({
              text: isChinese
                ? "[1] 国家标准局. GB/T 7713-1987 科学技术报告、学位论文和学术论文的编写格式[S]. 北京: 中国标准出版社, 1987."
                : "[1] National Standard of PRC. GB/T 7713-1987 Presentation of scientific and technical reports, theses and academic papers [S]. Beijing: Standards Press of China, 1987.",
              size: isChinese ? 18 : 16, font: config.fontMain,
            })],
            spacing: { after: 100 },
            alignment: AlignmentType.LEFT,
          })
        ];

    try {
      const templateName = isChinese ? "国标 (GB/T 7713)" : (isNature ? "Nature" : (isIEEE ? "IEEE" : "SCI"));
      toast.info(`正在按照 ${templateName} 规范生成 Word 文档...`);

      const doc = new Document({
        styles: {
          paragraphStyles: [
            {
              id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
              run: { size: config.heading1Size, bold: true, color: "000000", font: config.fontHeading, allCaps: isIEEE },
              paragraph: { spacing: { before: 400, after: 200 }, alignment: isIEEE ? AlignmentType.CENTER : AlignmentType.LEFT },
            },
            {
              id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
              run: { size: config.heading1Size - 4, bold: true, italics: isNature, color: "000000", font: config.fontHeading },
              paragraph: { spacing: { before: 300, after: 150 }, alignment: AlignmentType.LEFT },
            },
          ],
          default: { document: { run: { size: config.bodySize, font: config.fontMain, color: "000000" } } },
        },
        sections: [{
          properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: [
            new Paragraph({
              children: [new TextRun({ text: p.title || (isChinese ? "无标题论文" : "Untitled Paper"), bold: true, size: config.titleSize, font: config.fontHeading })],
              alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 },
            }),
            new Paragraph({
              children: [new TextRun({ text: p.authors || "", size: isChinese ? 28 : 24, font: config.fontMain })],
              alignment: AlignmentType.CENTER, spacing: { after: 200 },
            }),
            new Paragraph({
              children: [new TextRun({
                text: isChinese ? `（${p.affiliations || "农业科学研究中心，北京 100083"}）` : `(${p.affiliations || "Agricultural Science Laboratory, Beijing 100083"})`,
                size: 18, font: config.fontMain,
              })],
              alignment: AlignmentType.CENTER, spacing: { after: 600 },
            }),
            // Abstract
            ...(() => {
              const absPlain = stripHtmlToPlainForDocx(p.abstract || "");
              const stanzas = absPlain.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
              if (stanzas.length === 0) {
                return [new Paragraph({
                  children: [new TextRun({ text: isChinese ? "摘要：" : "Abstract: ", bold: true, size: config.bodySize, font: config.fontHeading })],
                  alignment: AlignmentType.JUSTIFIED, spacing: { line: config.lineSpacing, before: 200, after: 200 },
                  indent: isChinese ? { firstLine: config.indent } : undefined,
                })];
              }
              return stanzas.map((para, i) => new Paragraph({
                children: i === 0
                  ? [new TextRun({ text: isChinese ? "摘要：" : "Abstract: ", bold: true, size: config.bodySize, font: config.fontHeading }), ...parseMarkdownToRuns(para)]
                  : parseMarkdownToRuns(para),
                alignment: AlignmentType.JUSTIFIED, spacing: { line: config.lineSpacing, before: i === 0 ? 200 : 0, after: 200 },
                indent: isChinese ? { firstLine: config.indent } : undefined,
              }));
            })(),
            // Keywords
            new Paragraph({
              children: [
                new TextRun({ text: isChinese ? "关键词：" : "Keywords: ", bold: true, size: config.bodySize, font: config.fontHeading }),
                new TextRun({ text: formatKeywords(p, isChinese ? "zh" : "en"), size: config.bodySize, font: config.fontMain }),
              ],
              alignment: AlignmentType.JUSTIFIED, spacing: { after: 400 },
              indent: isChinese ? { firstLine: config.indent } : undefined,
            }),
            // Sections
            ...Object.entries({
              introduction: isChinese ? "引言" : "Introduction",
              methods: isChinese ? "材料与方法" : "Materials and Methods",
              results: isChinese ? "结果与讨论" : "Results and Discussion",
              conclusion: isChinese ? "结论" : "Conclusion",
            }).flatMap(([key, label], index) => {
              const raw = p.sections[key] || "";
              const content = stripHtmlToPlainForDocx(raw);
              if (!content) return [];

              const sectionNumber = index + 1;
              const romanNumerals = ["I", "II", "III", "IV"];
              const fullLabel = isIEEE ? `${romanNumerals[index]}. ${label.toUpperCase()}` : `${sectionNumber} ${label}`;
              const elements: Paragraph[] = [];

              elements.push(new Paragraph({
                children: [new TextRun({ text: fullLabel, bold: true, size: config.heading1Size, font: config.fontHeading })],
                heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, alignment: AlignmentType.LEFT,
              }));

              const stanzas = content.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
              let h2Counter = 0;

              for (const stanza of stanzas) {
                const hm = stanza.match(/^(#{1,6})\s+(.+)$/);
                if (hm && !stanza.includes("\n")) {
                  const level = hm[1].length;
                  let titleText = hm[2].trim().replace(/^([\d.]+|[一二三四五六七八九十]+[、.\s])\s*/, "");
                  if (level <= 3) {
                    h2Counter++;
                    titleText = isIEEE ? `${String.fromCharCode(64 + h2Counter)}. ${titleText}` : `${sectionNumber}.${h2Counter} ${titleText}`;
                  }
                  elements.push(new Paragraph({
                    children: [new TextRun({ text: titleText, bold: true, size: config.heading1Size - 4, font: config.fontHeading })],
                    heading: HeadingLevel.HEADING_2, alignment: AlignmentType.LEFT, spacing: { before: 180, after: 100 },
                  }));
                } else {
                  elements.push(new Paragraph({
                    children: parseMarkdownToRuns(stanza),
                    alignment: AlignmentType.JUSTIFIED, spacing: { line: config.lineSpacing, after: 200 },
                    indent: isChinese ? { firstLine: config.indent } : undefined,
                  }));
                }
              }
              return elements;
            }),
            // References
            new Paragraph({
              children: [new TextRun({ text: isChinese ? "参考文献" : "References", bold: true, size: config.heading1Size, font: config.fontHeading })],
              style: "Heading1", spacing: { before: 600, after: 200 }, alignment: isIEEE ? AlignmentType.CENTER : AlignmentType.LEFT,
            }),
            ...refParagraphs,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${p.title || "paper"}.docx`);
      toast.success(`Word 文档导出成功！已应用 ${templateName} 排版规范`);
    } catch (error) {
      console.error("Export Error:", error);
      toast.error("Word 导出失败，请重试");
    }
  }, [project, activeSection, editingContent, saveProject]);
}

import { useCallback } from "react";
import { toast } from "sonner";
import { mergeEditorIntoProject, getTemplateSectionContent } from "@/lib/export-content";
import { getTemplateSections } from "@/lib/template-sections";
import type { ProjectData } from "@/contracts/project";

/** Markdown 导出：合并编辑器当前内容后生成 .md 文件 */
export function useMarkdownExport(
  project: ProjectData,
  activeSection: string,
  editingContent: string,
) {
  return useCallback(() => {
    const p = mergeEditorIntoProject(project, activeSection, editingContent);
    const referencesMd =
      p.references && p.references.length > 0
        ? p.references.map((ref, i) => `[${i + 1}] ${ref}`).join("\n\n")
        : p.template === "gbt7713"
          ? "[1] 国家标准局. GB/T 7713-1987 科学技术报告、学位论文和学术论文的编写格式[S]. 北京: 中国标准出版社, 1987."
          : "[1] National Standard of PRC. GB/T 7713-1987 Presentation of scientific and technical reports, theses and academic papers [S]. Beijing: Standards Press of China, 1987.";

    const refsHeading = p.template === "gbt7713" ? "参考文献" : "References";
    const templateSections = getTemplateSections(p.template || "sci", p.mode);
    const bodyMd = templateSections
      .map((def) => {
        const content = getTemplateSectionContent(p.sections, def);
        if (!content.trim()) return "";
        return `## ${def.sectionNumber}. ${def.label}\n${content}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const content = `# ${p.title || "Untitled Research Paper"}

**Authors:** ${p.authors || "Author Name"}

## Abstract
${p.abstract || "No abstract provided."}

${bodyMd || "_（暂无正文章节内容）_"}

## ${refsHeading}
${referencesMd}
`;

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.title || "research_paper"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("已生成 Markdown 文件并开始下载");
  }, [project, activeSection, editingContent]);
}

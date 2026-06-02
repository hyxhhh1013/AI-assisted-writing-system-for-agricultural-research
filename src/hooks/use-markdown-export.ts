import { useCallback } from "react";
import { toast } from "sonner";
import { mergeEditorIntoProject } from "@/lib/export-content";
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
    const content = `# ${p.title || "Untitled Research Paper"}

**Authors:** ${p.authors || "Author Name"}

## Abstract
${p.abstract || "No abstract provided."}

## 1. Introduction
${p.sections.introduction || "N/A"}

## 2. Materials and Methods
${p.sections.methods || "N/A"}

## 3. Results and Discussion
${p.sections.results || "N/A"}

## 4. Conclusion
${p.sections.conclusion || "N/A"}

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

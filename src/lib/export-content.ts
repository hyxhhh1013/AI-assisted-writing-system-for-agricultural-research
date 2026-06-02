import type { ProjectData } from "@/contracts/project";

/** 将中间编辑器未保存的正文合并进 project，供预览 / 导出 */
export function mergeEditorIntoProject(
  project: ProjectData,
  activeSection: string,
  editingContent: string,
): ProjectData {
  if (activeSection === "abstract") {
    return { ...project, abstract: editingContent };
  }
  return {
    ...project,
    sections: {
      ...project.sections,
      [activeSection]: editingContent,
    },
  };
}

/**
 * 段落编辑器 / TipTap 产出 HTML 时，导出 Word 前压成纯文本并尽量保留段落与加粗。
 */
export function stripHtmlToPlainForDocx(htmlOrText: string): string {
  if (!htmlOrText) return "";
  const s = htmlOrText.trim();
  if (!s.includes("<")) return s;

  let t = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/div>\s*<div[^>]*>/gi, "\n\n")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<\/?div[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<i>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  t = t.replace(/<[^>]+>/g, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

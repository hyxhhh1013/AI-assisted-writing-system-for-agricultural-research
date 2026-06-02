import type { ProjectData } from "@/contracts/project";
import type { TemplateSectionDef } from "@/lib/template-sections";
import { getProjectWritingMode, getSectionLabelForMode } from "@/lib/section-registry";

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

/** 收集项目全部有内容的章节（含 abstract，跳过 sections.abstract 重复项） */
export function collectProjectSectionEntries(
  project: Pick<ProjectData, "abstract" | "sections">,
): { key: string; content: string }[] {
  const entries: { key: string; content: string }[] = [];
  if (project.abstract?.trim()) {
    entries.push({ key: "abstract", content: project.abstract });
  }
  for (const [key, content] of Object.entries(project.sections || {})) {
    if (key === "abstract") continue;
    if (typeof content === "string" && content.trim()) {
      entries.push({ key, content });
    }
  }
  return entries;
}

/** 按模板声明读取 section 正文（含 mergeKeys 合并，与预览一致） */
export function getTemplateSectionContent(
  sections: Record<string, string | undefined>,
  def: TemplateSectionDef,
): string {
  const main = sections[def.key] || "";
  if (!def.mergeKeys?.length) return main;
  const merged = def.mergeKeys
    .map((mk) => sections[mk] || "")
    .filter(Boolean)
    .join("\n\n");
  return merged ? `${main}\n\n${merged}` : main;
}

/** 从项目正文构建查重面板初始文本（按写作模式章节标签） */
export function buildPlagiarismContentFromProject(
  project: Pick<ProjectData, "abstract" | "sections" | "mode">,
): string {
  const mode = getProjectWritingMode(project.mode);
  const parts: string[] = [];
  if (project.abstract?.trim()) parts.push(`摘要：${project.abstract}`);
  for (const [key, content] of Object.entries(project.sections || {})) {
    if (key === "abstract") continue;
    if (typeof content === "string" && content.trim()) {
      parts.push(`${getSectionLabelForMode(key, mode)}：${content}`);
    }
  }
  return parts.join("\n\n");
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

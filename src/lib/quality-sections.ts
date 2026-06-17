import type { ProjectData } from "@/contracts/project";
import {
  getProjectWritingMode,
  getSectionKeysForMode,
  getSectionLabelForMode,
} from "@/lib/section-registry";

export interface QualitySection {
  key: string;
  title: string;
  content: string;
  wordCount: number;
}

/** 从项目构建质量检测用章节列表（与审查模块一致） */
export function buildQualitySections(
  project: Pick<ProjectData, "abstract" | "sections" | "mode">,
): QualitySection[] {
  const mode = getProjectWritingMode(project.mode);
  const list: QualitySection[] = [];

  if (project.abstract?.trim()) {
    const content = project.abstract.trim();
    list.push({
      key: "abstract",
      title: getSectionLabelForMode("abstract", mode),
      content,
      wordCount: content.length,
    });
  }

  for (const key of getSectionKeysForMode(mode)) {
    if (key === "abstract") continue;
    const raw = project.sections?.[key];
    if (typeof raw === "string" && raw.trim()) {
      const content = raw.trim();
      list.push({
        key,
        title: getSectionLabelForMode(key, mode),
        content,
        wordCount: content.length,
      });
    }
  }

  return list;
}

/** 单章或全文拼接为查重输入 */
export function buildCheckContentFromSections(
  sections: QualitySection[],
  scope: "full" | string,
): string {
  if (scope === "full") {
    return sections.map((s) => `${s.title}：\n${s.content}`).join("\n\n");
  }
  const one = sections.find((s) => s.key === scope);
  if (!one) return sections.map((s) => `${s.title}：\n${s.content}`).join("\n\n");
  return `${one.title}：\n${one.content}`;
}

export function totalWordCount(sections: QualitySection[]): number {
  return sections.reduce((n, s) => n + s.wordCount, 0);
}

import { IMRAD_SECTION_KEYS, IMRAD_LABELS_SHORT_ZH } from "@/lib/imrad";
import type { ProjectData } from "@/contracts/project";

export interface ReviewSectionInput {
  key: string;
  title: string;
  content: string;
}

/** 从项目数据构建审查用 IMRAD 章节（跳过空章节） */
export function buildReviewSectionsFromProject(project: ProjectData): ReviewSectionInput[] {
  const sections: ReviewSectionInput[] = [];

  if (project.abstract?.trim()) {
    sections.push({
      key: "abstract",
      title: IMRAD_LABELS_SHORT_ZH.abstract,
      content: project.abstract.trim(),
    });
  }

  for (const key of IMRAD_SECTION_KEYS) {
    if (key === "abstract") continue;
    const raw = project.sections?.[key];
    if (typeof raw === "string" && raw.trim()) {
      sections.push({
        key,
        title: IMRAD_LABELS_SHORT_ZH[key],
        content: raw.trim(),
      });
    }
  }

  return sections;
}

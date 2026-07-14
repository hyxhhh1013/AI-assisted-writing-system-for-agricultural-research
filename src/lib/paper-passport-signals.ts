import type { ProjectData } from "@/contracts/project";
import type { PaperPassport } from "@/contracts/paper-passport";
import { parseArgumentBlueprint, isArgumentBlueprintConfirmed } from "@/contracts/argument-blueprint";
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";

const MIN_SECTION_CHARS = 50;

/** 从工作台 Project 状态构建 passport 进度信号（客户端近似） */
export function buildPassportSignalsFromProject(
  project: ProjectData,
  passport?: PaperPassport | null,
): PassportProgressSignals {
  const mode = project.mode === "research" ? "research" : "review";
  const coreKeys = getCoreSectionKeysForMode(mode);
  const filledCoreSections = coreKeys.filter((key) => {
    const content = key === "abstract" ? project.abstract : project.sections?.[key];
    return (content?.trim().length ?? 0) >= MIN_SECTION_CHARS;
  }).length;

  const argument = parseArgumentBlueprint(project.argumentBlueprint);
  const reviewDoneCount = passport?.reviewRound?.doneCount
    ?? (passport?.phaseStatus["6"] === "done"
      ? 2
      : passport?.phaseStatus["6"] === "in_progress"
        ? 1
        : 0);

  return {
    referenceCount: project.references?.length ?? 0,
    hasBlueprint: Boolean(project.writingBlueprint?.trim()),
    outlineChars: project.outline?.trim().length ?? 0,
    filledCoreSections,
    totalCoreSections: coreKeys.length,
    expandedOutlineCount: project.expandedOutlineSections?.length ?? 0,
    abstractChars: project.abstract?.trim().length ?? 0,
    reviewDoneCount,
    hasConfirmedArgument: isArgumentBlueprintConfirmed(argument),
    hasExported: (passport?.exportFormats?.formats.length ?? 0) > 0,
  };
}

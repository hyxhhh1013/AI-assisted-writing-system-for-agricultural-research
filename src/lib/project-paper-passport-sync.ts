import prisma from "@/lib/prisma";
import { parseExpandedOutlineSections } from "@/contracts/project";
import {
  parsePaperPassport,
  serializePaperPassport,
  type PaperPassport,
} from "@/contracts/paper-passport";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import {
  recomputePassportProgress,
  type PassportProgressSignals,
} from "@/lib/paper-passport-progress";

const MIN_SECTION_CHARS = 50;

function buildSignals(
  project: {
    outline: string | null;
    abstract: string | null;
    mode: string | null;
    expandedOutlineSections: string | null;
    references: { id: string }[];
    sections: { key: string; content: string }[];
  },
  hasBlueprint: boolean,
  reviewDoneCount: number,
): PassportProgressSignals {
  const mode = project.mode === "research" ? "research" : "review";
  const coreKeys = getCoreSectionKeysForMode(mode);
  const filledCoreSections = coreKeys.filter((key) => {
    const section = project.sections.find((s) => s.key === key);
    return (section?.content.trim().length ?? 0) >= MIN_SECTION_CHARS;
  }).length;

  return {
    referenceCount: project.references.length,
    hasBlueprint,
    outlineChars: project.outline?.trim().length ?? 0,
    filledCoreSections,
    totalCoreSections: coreKeys.length,
    expandedOutlineCount: parseExpandedOutlineSections(project.expandedOutlineSections).length,
    abstractChars: project.abstract?.trim().length ?? 0,
    reviewDoneCount,
  };
}

/** 读取项目状态并重算 PaperPassport；无 passport 时返回 null */
export async function syncProjectPaperPassport(
  projectId: string,
): Promise<PaperPassport | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      paperPassport: true,
      outline: true,
      abstract: true,
      mode: true,
      expandedOutlineSections: true,
      references: { select: { id: true } },
      sections: { select: { key: true, content: true } },
    },
  });
  if (!project?.paperPassport) return null;

  const passport = parsePaperPassport(project.paperPassport);
  if (!passport) return null;

  const [blueprintRaw, reviewDoneCount] = await Promise.all([
    readWritingBlueprint(projectId),
    prisma.reviewCheck.count({
      where: { projectId, status: "done" },
    }),
  ]);

  const next = recomputePassportProgress(
    passport,
    buildSignals(project, Boolean(blueprintRaw?.trim()), reviewDoneCount),
  );

  const serialized = serializePaperPassport(next);
  if (serialized !== project.paperPassport) {
    await prisma.project.update({
      where: { id: projectId },
      data: { paperPassport: serialized },
    });
  }

  return next;
}

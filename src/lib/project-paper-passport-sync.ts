import prisma from "@/lib/prisma";
import { parseExpandedOutlineSections } from "@/contracts/project";
import {
  createInitialPaperPassport,
  parsePaperPassport,
  serializePaperPassport,
  type PaperConfigRecord,
  type PaperPassport,
} from "@/contracts/paper-passport";
import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import {
  recomputePassportProgress,
  type PassportProgressSignals,
} from "@/lib/paper-passport-progress";

const MIN_SECTION_CHARS = 50;

const CITATION_STYLES = new Set<PaperConfigRecord["citationStyle"]>([
  "gbt7714",
  "vancouver",
  "apa7",
  "ieee",
]);

type ProjectPassportSnapshot = {
  id: string;
  title: string;
  paperPassport: string | null;
  outline: string | null;
  abstract: string | null;
  mode: string | null;
  language: string | null;
  citationStyle: string | null;
  expandedOutlineSections: string | null;
  references: { id: string }[];
  sections: { key: string; content: string }[];
};

function normalizeCitationStyle(
  raw: string | null | undefined,
): PaperConfigRecord["citationStyle"] {
  if (raw && CITATION_STYLES.has(raw as PaperConfigRecord["citationStyle"])) {
    return raw as PaperConfigRecord["citationStyle"];
  }
  return "gbt7714";
}

/** 旧项目无 passport 时，从 Project 元数据补建初始快照 */
export function bootstrapPassportFromProject(
  project: Pick<ProjectPassportSnapshot, "title" | "mode" | "language" | "citationStyle">,
): PaperPassport {
  return createInitialPaperPassport({
    paperTitle: project.title.trim() || "未命名项目",
    paperType: project.mode === "research" ? "research" : "review",
    targetJournal: "",
    wordCount: "",
    language: project.language === "en" ? "en" : "zh",
    citationStyle: normalizeCitationStyle(project.citationStyle),
  });
}

function buildSignals(
  project: Pick<
    ProjectPassportSnapshot,
    "outline" | "abstract" | "mode" | "expandedOutlineSections" | "references" | "sections"
  >,
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

async function loadProjectPassportSnapshot(
  projectId: string,
): Promise<ProjectPassportSnapshot | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      paperPassport: true,
      outline: true,
      abstract: true,
      mode: true,
      language: true,
      citationStyle: true,
      expandedOutlineSections: true,
      references: { select: { id: true } },
      sections: { select: { key: true, content: true } },
    },
  });
}

async function recomputeAndPersistPassport(
  projectId: string,
  project: ProjectPassportSnapshot,
  passport: PaperPassport,
): Promise<PaperPassport> {
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

/** 确保项目有 passport（旧项目自动补建）并重算阶段进度 */
export async function ensureProjectPaperPassport(
  projectId: string,
): Promise<PaperPassport | null> {
  const project = await loadProjectPassportSnapshot(projectId);
  if (!project) return null;

  let passport = parsePaperPassport(project.paperPassport);
  if (!passport) {
    passport = bootstrapPassportFromProject(project);
  }

  return recomputeAndPersistPassport(projectId, project, passport);
}

/** 读取项目状态并重算 PaperPassport（无项目时返回 null） */
export async function syncProjectPaperPassport(
  projectId: string,
): Promise<PaperPassport | null> {
  return ensureProjectPaperPassport(projectId);
}

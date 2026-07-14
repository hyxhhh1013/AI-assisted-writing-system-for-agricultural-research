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
import { readArgumentBlueprint } from "@/lib/project-argument-blueprint-db";
import {
  isArgumentBlueprintConfirmed,
  parseArgumentBlueprint,
} from "@/contracts/argument-blueprint";
import {
  recomputePassportProgress,
  type PassportProgressSignals,
} from "@/lib/paper-passport-progress";
import { enrichPassportSnapshots } from "@/lib/paper-passport-snapshots";

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
  hasConfirmedArgument: boolean,
  hasExported: boolean,
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
    hasConfirmedArgument,
    hasExported,
  };
}

async function readPaperPassportRaw(projectId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ paperPassport: string | null }[]>`
    SELECT "paperPassport" FROM "Project" WHERE id = ${projectId} LIMIT 1
  `;
  return rows[0]?.paperPassport ?? null;
}

async function writePaperPassportRaw(projectId: string, serialized: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Project" SET "paperPassport" = ${serialized} WHERE id = ${projectId}
  `;
}

async function loadProjectPassportSnapshot(
  projectId: string,
): Promise<ProjectPassportSnapshot | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
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
  if (!project) return null;

  let paperPassport: string | null = null;
  try {
    paperPassport = await readPaperPassportRaw(projectId);
  } catch {
    // 列未迁移或 Prisma client 未 generate 时跳过
  }

  return { ...project, paperPassport };
}

async function recomputeAndPersistPassport(
  projectId: string,
  project: ProjectPassportSnapshot,
  passport: PaperPassport,
): Promise<PaperPassport> {
  const [blueprintRaw, argumentRaw, reviewDoneCount] = await Promise.all([
    readWritingBlueprint(projectId),
    readArgumentBlueprint(projectId),
    prisma.reviewCheck.count({
      where: { projectId, status: "done" },
    }),
  ]);

  const argument = parseArgumentBlueprint(argumentRaw);
  const hasExported = (passport.exportFormats?.formats.length ?? 0) > 0;
  const signals = buildSignals(
    project,
    Boolean(blueprintRaw?.trim()),
    reviewDoneCount,
    isArgumentBlueprintConfirmed(argument),
    hasExported,
  );

  let next = enrichPassportSnapshots(
    recomputePassportProgress(passport, signals),
    signals,
  );
  if (argument) {
    next = {
      ...next,
      argument: {
        claimCount: argument.claims.length,
        confirmed: Boolean(argument.confirmedAt),
        updatedAt: Date.now(),
      },
    };
  }

  const serialized = serializePaperPassport(next);
  if (serialized !== project.paperPassport) {
    try {
      await writePaperPassportRaw(projectId, serialized);
    } catch {
      // 列未就绪时不阻塞项目读写
      return next;
    }
  }

  return next;
}

/** 确保项目有 passport（旧项目自动补建）并重算阶段进度 */
export async function ensureProjectPaperPassport(
  projectId: string,
): Promise<PaperPassport | null> {
  try {
    const project = await loadProjectPassportSnapshot(projectId);
    if (!project) return null;

    let passport = parsePaperPassport(project.paperPassport);
    if (!passport) {
      passport = bootstrapPassportFromProject(project);
    }

    return recomputeAndPersistPassport(projectId, project, passport);
  } catch {
    return null;
  }
}

/** 更新 passport.config 并重算阶段（同步 Project 标题/模式/语言/引用格式） */
export async function updateProjectPaperPassportConfig(
  projectId: string,
  config: PaperConfigRecord,
): Promise<PaperPassport | null> {
  try {
    const project = await loadProjectPassportSnapshot(projectId);
    if (!project) return null;

    let passport = parsePaperPassport(project.paperPassport);
    if (!passport) {
      passport = bootstrapPassportFromProject(project);
    }

    passport = {
      ...passport,
      config,
      updatedAt: Date.now(),
    };

    await prisma.project.update({
      where: { id: projectId },
      data: {
        title: config.paperTitle.trim() || project.title,
        mode: config.paperType,
        language: config.language,
        citationStyle: config.citationStyle,
      },
    });

    const refreshed = await loadProjectPassportSnapshot(projectId);
    if (!refreshed) return null;

    return recomputeAndPersistPassport(projectId, refreshed, passport);
  } catch {
    return null;
  }
}

export async function savePaperPassportForProject(
  projectId: string,
  serialized: string,
): Promise<void> {
  await writePaperPassportRaw(projectId, serialized);
}

/** 读取项目状态并重算 PaperPassport（无项目时返回 null） */
export async function syncProjectPaperPassport(
  projectId: string,
): Promise<PaperPassport | null> {
  return ensureProjectPaperPassport(projectId);
}

/** 记录一次导出，推进 Phase 7 */
export async function markProjectExportFormat(
  projectId: string,
  format: "docx" | "pdf" | "md",
): Promise<PaperPassport | null> {
  try {
    const project = await loadProjectPassportSnapshot(projectId);
    if (!project) return null;

    let passport = parsePaperPassport(project.paperPassport);
    if (!passport) {
      passport = bootstrapPassportFromProject(project);
    }

    const prev = passport.exportFormats?.formats ?? [];
    const formats = prev.includes(format) ? prev : [...prev, format];
    passport = {
      ...passport,
      exportFormats: { formats, updatedAt: Date.now() },
      updatedAt: Date.now(),
    };

    await writePaperPassportRaw(projectId, serializePaperPassport(passport));
    return recomputeAndPersistPassport(projectId, project, passport);
  } catch {
    return null;
  }
}

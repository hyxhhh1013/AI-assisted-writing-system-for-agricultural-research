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
import { parseArgumentBlueprint } from "@/contracts/argument-blueprint";
import {
  recomputePassportProgress,
  type PassportProgressSignals,
} from "@/lib/paper-passport-progress";
import { enrichPassportSnapshots } from "@/lib/paper-passport-snapshots";
import { evaluateCitationGate } from "@/lib/citation-gate";

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
  hasArgumentBlueprint: boolean,
  reviewDoneCount: number,
  argumentMeta?: { chainCount: number; rebuttalCount: number },
): PassportProgressSignals {
  const mode = project.mode === "research" ? "research" : "review";
  const coreKeys = getCoreSectionKeysForMode(mode);
  const filledCoreSections = coreKeys.filter((key) => {
    const section = project.sections.find((s) => s.key === key);
    return (section?.content.trim().length ?? 0) >= MIN_SECTION_CHARS;
  }).length;

  const gate = evaluateCitationGate({
    texts: [
      project.abstract ?? "",
      ...project.sections.map((s) => s.content),
    ],
    refCount: project.references.length,
  });

  return {
    referenceCount: project.references.length,
    hasBlueprint,
    hasArgumentBlueprint,
    outlineChars: project.outline?.trim().length ?? 0,
    filledCoreSections,
    totalCoreSections: coreKeys.length,
    expandedOutlineCount: parseExpandedOutlineSections(project.expandedOutlineSections).length,
    abstractChars: project.abstract?.trim().length ?? 0,
    reviewDoneCount,
    argumentChainCount: argumentMeta?.chainCount ?? 0,
    argumentRebuttalCount: argumentMeta?.rebuttalCount ?? 0,
    citationGatePassed: gate.passed,
    citationExportReady: gate.exportReady,
    citationOutOfBounds: gate.outOfBounds,
    citationCount: gate.citationCount,
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
  const [blueprintRaw, argumentRaw] = await Promise.all([
    readWritingBlueprint(projectId),
    readArgumentBlueprint(projectId),
  ]);

  // Phase 7 / 轮次：以 Passport 编排计数为准，不用全历史 ReviewCheck 条数
  const reviewDoneCount = Math.min(
    Math.max(0, passport.reviewRound?.doneCount ?? 0),
    2,
  );

  const argument = parseArgumentBlueprint(argumentRaw);
  const signals = buildSignals(
    project,
    Boolean(blueprintRaw?.trim()),
    Boolean(argument),
    reviewDoneCount,
    argument
      ? { chainCount: argument.chains.length, rebuttalCount: argument.rebuttals.length }
      : undefined,
  );

  const next = enrichPassportSnapshots(
    recomputePassportProgress(passport, signals),
    signals,
  );

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
  } catch (error) {
    // 不吞错：暴露真实原因，避免上层误报「项目无 PaperPassport」
    console.error("[passport-sync] ensureProjectPaperPassport failed:", error);
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

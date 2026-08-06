import prisma from "@/lib/prisma";
import type { ReviewInput, ReviewIssue, ReviewReport } from "@/contracts/review";
import {
  REVIEW_MAX_ROUNDS,
  buildReviewRoundHint,
  type ReviewRoundResult,
  type ReviewRoundStatus,
} from "@/contracts/review-rounds";
import { runReview } from "@/services/review-service";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import {
  parsePaperPassport,
  serializePaperPassport,
  type PaperPassport,
} from "@/contracts/paper-passport";

async function readPassportDoneCount(projectId: string): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ paperPassport: string | null }[]>`
      SELECT "paperPassport" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
    `;
    const passport = parsePaperPassport(rows[0]?.paperPassport ?? null);
    if (!passport?.reviewRound) return null;
    return Math.min(
      Math.max(0, passport.reviewRound.doneCount),
      REVIEW_MAX_ROUNDS,
    );
  } catch {
    return null;
  }
}

/**
 * 轮次权威源：Passport.reviewRound.doneCount。
 * 避免用全历史 ReviewCheck 条数（老项目 ≥2 条会误判「已满」）。
 */
export async function getReviewRoundStatus(projectId: string): Promise<ReviewRoundStatus> {
  const passportDone = await readPassportDoneCount(projectId);
  const doneCount = passportDone ?? 0;

  const last = await prisma.reviewCheck.findFirst({
    where: { projectId, status: "done" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      overallScore: true,
      overallGrade: true,
    },
  });

  return {
    projectId,
    doneCount,
    maxRounds: REVIEW_MAX_ROUNDS,
    remaining: Math.max(0, REVIEW_MAX_ROUNDS - doneCount),
    complete: doneCount >= REVIEW_MAX_ROUNDS,
    lastCheckId: last?.id ?? null,
    lastScore: last?.overallScore ?? null,
    lastGrade: last?.overallGrade ?? null,
  };
}

function collectTopIssues(report: ReviewReport, limit = 8): ReviewRoundResult["topIssues"] {
  const all: ReviewIssue[] = [];
  for (const dim of ["academic", "argument", "structure", "integrity"] as const) {
    all.push(...report.dimensions[dim].issues);
  }
  const rank = { high: 3, medium: 2, low: 1 };
  return all
    .sort((a, b) => rank[b.severity] - rank[a.severity])
    .slice(0, limit)
    .map((i) => ({
      id: i.id,
      dimension: i.dimension,
      severity: i.severity,
      description: i.description,
      suggestion: i.suggestion,
    }));
}

function countHighMedium(report: ReviewReport): number {
  let n = 0;
  for (const dim of ["academic", "argument", "structure", "integrity"] as const) {
    n += report.dimensions[dim].issues.filter(
      (i) => i.severity === "high" || i.severity === "medium",
    ).length;
  }
  return n;
}

async function patchPassportReviewSnapshot(
  projectId: string,
  status: ReviewRoundStatus,
): Promise<void> {
  const rows = await prisma.$queryRaw<{ paperPassport: string | null }[]>`
    SELECT "paperPassport" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
  `;
  const passport = parsePaperPassport(rows[0]?.paperPassport ?? null);
  if (!passport) return;

  const next: PaperPassport = {
    ...passport,
    reviewRound: {
      doneCount: status.doneCount,
      updatedAt: Date.now(),
      lastScore: status.lastScore ?? undefined,
      lastGrade: status.lastGrade ?? undefined,
      lastCheckId: status.lastCheckId ?? undefined,
      maxRounds: REVIEW_MAX_ROUNDS,
    },
    updatedAt: Date.now(),
  };

  await prisma.$executeRaw`
    UPDATE "Project" SET "paperPassport" = ${serializePaperPassport(next)}
    WHERE "id" = ${projectId}
  `;
}

/**
 * 跑「下一轮」审查（最多 2 轮）。已满则不再调用模型。
 * 第 2 轮会把上一轮中高严重度问题摘要注入 target，促使复查。
 * doneCount 以 Passport 递增为准，不依赖历史 ReviewCheck 总量。
 */
export async function runNextReviewRound(
  input: ReviewInput,
  options?: { force?: boolean },
): Promise<ReviewRoundResult> {
  const projectId = input.projectId;
  if (!projectId) {
    throw new Error("审查编排需要 projectId");
  }

  let status = await getReviewRoundStatus(projectId);
  if (status.complete && !options?.force) {
    return {
      status,
      ran: false,
      round: status.doneCount,
      report: null,
      nextHint: buildReviewRoundHint(status, 0),
      topIssues: [],
    };
  }

  let previousFocus = "";
  if (status.doneCount >= 1 && status.lastCheckId) {
    const prevIssues = await prisma.reviewIssue.findMany({
      where: {
        checkId: status.lastCheckId,
        severity: { in: ["high", "medium"] },
      },
      take: 12,
      orderBy: { severity: "asc" },
    });
    if (prevIssues.length > 0) {
      previousFocus = [
        "【第 2 轮复查焦点：请核对下列问题是否已修复，未修复须再次列出】",
        ...prevIssues.map(
          (i, idx) =>
            `${idx + 1}. [${i.severity}] ${i.dimension}: ${i.description}` +
            (i.suggestion ? ` → 建议：${i.suggestion}` : ""),
        ),
      ].join("\n");
    }
  }

  const report = await runReview({
    ...input,
    projectId,
    config: {
      ...input.config,
      target: [input.config?.target, previousFocus].filter(Boolean).join("\n\n") || undefined,
    },
  });

  const nextDone = Math.min(status.doneCount + 1, REVIEW_MAX_ROUNDS);
  const last = await prisma.reviewCheck.findFirst({
    where: { projectId, status: "done" },
    orderBy: { createdAt: "desc" },
    select: { id: true, overallScore: true, overallGrade: true },
  });

  status = {
    projectId,
    doneCount: nextDone,
    maxRounds: REVIEW_MAX_ROUNDS,
    remaining: Math.max(0, REVIEW_MAX_ROUNDS - nextDone),
    complete: nextDone >= REVIEW_MAX_ROUNDS,
    lastCheckId: last?.id ?? report.reviewId ?? null,
    lastScore: last?.overallScore ?? report.overallScore ?? null,
    lastGrade: last?.overallGrade ?? report.overallGrade ?? null,
  };

  try {
    await patchPassportReviewSnapshot(projectId, status);
  } catch {
    /* ignore */
  }

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* ignore */
  }

  const highMedium = countHighMedium(report);
  return {
    status,
    ran: true,
    round: status.doneCount,
    report,
    nextHint: buildReviewRoundHint(status, highMedium),
    topIssues: collectTopIssues(report),
  };
}

import prisma from "@/lib/prisma";
import type { ReviewGateState } from "@/contracts/review-gate";

/** 读取项目审查门禁状态（done 轮次 + 最新一轮未关闭 high） */
export async function getProjectReviewGateState(
  projectId: string,
): Promise<ReviewGateState> {
  const doneCount = await prisma.reviewCheck.count({
    where: { projectId, status: "done" },
  });

  const latest = await prisma.reviewCheck.findFirst({
    where: { projectId, status: "done" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!latest) {
    return { doneCount, openHighIssueCount: 0, latestCheckId: null };
  }

  const openHighIssueCount = await prisma.reviewIssue.count({
    where: {
      checkId: latest.id,
      severity: "high",
      status: "open",
    },
  });

  return {
    doneCount,
    openHighIssueCount,
    latestCheckId: latest.id,
  };
}

export async function updateReviewIssueStatus(
  issueId: string,
  status: "open" | "fixed" | "dismissed",
  fixedContent?: string | null,
): Promise<boolean> {
  const existing = await prisma.reviewIssue.findUnique({
    where: { id: issueId },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.reviewIssue.update({
    where: { id: issueId },
    data: {
      status,
      ...(fixedContent !== undefined ? { fixedContent } : {}),
    },
  });
  return true;
}

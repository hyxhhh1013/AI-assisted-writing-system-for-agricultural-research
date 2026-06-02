import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated, success, badRequest } from "@/lib/admin-response";
import { parseListParams } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { adminProjectDeleteSchema } from "@/lib/validations";

const CORE_KEYS = ["abstract", "introduction", "methods", "results", "conclusion"];

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);

  const where: any = {};
  if (params.userId) where.userId = params.userId;
  if (params.template) where.template = params.template;
  if (params.mode) where.mode = params.mode;
  if (params.q) where.title = { contains: params.q };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { lastUpdated: "desc" },
      skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 20),
      take: params.pageSize ?? 20,
      select: {
        id: true, title: true, template: true, mode: true, createdAt: true, lastUpdated: true,
        owner: { select: { name: true, email: true } },
        sections: { select: { key: true, content: true } },
        _count: { select: { references: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return paginated(
    projects.map((p) => {
      const filledCount = p.sections.filter(s => s.content && s.content.trim().length > 10).length;
      const coreFilled = p.sections.filter(s => CORE_KEYS.includes(s.key) && s.content && s.content.trim().length > 10).length;
      const progress = Math.round((coreFilled / CORE_KEYS.length) * 100);
      return {
        id: p.id, title: p.title, template: p.template, mode: p.mode,
        userName: p.owner?.name ?? "未知", userEmail: p.owner?.email ?? "",
        progress, referenceCount: p._count.references,
        createdAt: p.createdAt.toISOString(), lastUpdated: p.lastUpdated.toISOString(),
      };
    }),
    total,
    params,
  );
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminProjectDeleteSchema, body);
  if (ve) return ve;
  const { projectId } = data;

  await prisma.$transaction([
    prisma.reviewIssue.deleteMany({ where: { check: { projectId } } }),
    prisma.reviewCheck.deleteMany({ where: { projectId } }),
    prisma.rewriteSuggestion.deleteMany({ where: { check: { projectId } } }),
    prisma.plagiarismMatch.deleteMany({ where: { check: { projectId } } }),
    prisma.plagiarismCheck.deleteMany({ where: { projectId } }),
    prisma.referenceSource.deleteMany({ where: { projectId } }),
    prisma.analysisResult.deleteMany({ where: { projectId } }),
    prisma.reference.deleteMany({ where: { projectId } }),
    prisma.section.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  return success(undefined, "项目已删除");
}

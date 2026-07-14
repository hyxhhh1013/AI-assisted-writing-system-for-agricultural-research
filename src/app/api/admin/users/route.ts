import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated, success, badRequest } from "@/lib/admin-response";
import { parseListParams } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { adminUserDeleteSchema, adminUserRolePatchSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);

  const where: Prisma.UserWhereInput = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q } },
      { email: { contains: params.q } },
    ];
  }

  const sortField = params.sortBy === "name" || params.sortBy === "email" || params.sortBy === "role"
    ? params.sortBy
    : "createdAt";
  const sortDir = params.sortOrder === "asc" ? "asc" : "desc";

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        _count: { select: { projects: true } },
      },
      orderBy: { [sortField]: sortDir },
      skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 20),
      take: params.pageSize ?? 20,
    }),
    prisma.user.count({ where }),
  ]);

  return paginated(
    users.map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      projectCount: u._count.projects,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    params,
  );
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminUserRolePatchSchema, body);
  if (ve) return ve;
  const { userId, role } = data;
  await prisma.user.update({ where: { id: userId }, data: { role } });
  return success(undefined, "角色已更新");
}

export async function DELETE(req: NextRequest) {
  const { error: authError, user: adminUser } = await requireAdmin(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminUserDeleteSchema, body);
  if (ve) return ve;
  const { userId } = data;
  if (userId === adminUser?.id) return badRequest("不能删除自己");

  // 级联删除关联数据
  const projectIds = (await prisma.project.findMany({ where: { userId }, select: { id: true } })).map(p => p.id);
  if (projectIds.length > 0) {
    await prisma.$transaction([
      prisma.reviewIssue.deleteMany({ where: { check: { projectId: { in: projectIds } } } }),
      prisma.reviewCheck.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.rewriteSuggestion.deleteMany({ where: { check: { projectId: { in: projectIds } } } }),
      prisma.plagiarismMatch.deleteMany({ where: { check: { projectId: { in: projectIds } } } }),
      prisma.plagiarismCheck.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.referenceSource.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.analysisResult.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.reference.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.section.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.project.deleteMany({ where: { id: { in: projectIds } } }),
    ]);
  }
  await prisma.user.delete({ where: { id: userId } });

  return success(undefined, `用户已删除（含 ${projectIds.length} 个项目）`);
}

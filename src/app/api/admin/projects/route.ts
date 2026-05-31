import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const CORE_KEYS = ["abstract", "introduction", "methods", "results", "conclusion"];

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const template = searchParams.get("template");

  const where: any = {};
  if (userId) where.userId = userId;
  if (template) where.template = template;

  const projects = await prisma.project.findMany({
    where,
    orderBy: { lastUpdated: "desc" },
    select: {
      id: true,
      title: true,
      template: true,
      mode: true,
      createdAt: true,
      lastUpdated: true,
      owner: { select: { name: true, email: true } },
      sections: { select: { key: true, content: true } },
      _count: { select: { references: true } },
    },
  });

  return NextResponse.json(
    projects.map((p) => {
      const filledCount = p.sections.filter(
        (s) => s.content && s.content.trim().length > 10
      ).length;
      const coreFilled = p.sections.filter(
        (s) => CORE_KEYS.includes(s.key) && s.content && s.content.trim().length > 10
      ).length;
      const progress = Math.round((coreFilled / CORE_KEYS.length) * 100);

      return {
        id: p.id,
        title: p.title,
        template: p.template,
        mode: p.mode,
        userName: p.owner?.name ?? "未知",
        userEmail: p.owner?.email ?? "",
        progress,
        referenceCount: p._count.references,
        createdAt: p.createdAt.toISOString(),
        lastUpdated: p.lastUpdated.toISOString(),
      };
    })
  );
}

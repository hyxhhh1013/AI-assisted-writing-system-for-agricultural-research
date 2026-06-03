import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  if (!q.trim()) return success({ users: [], projects: [], knowledge: [] });

  const [users, projects, knowledge] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      select: { id: true, name: true, email: true, role: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: { OR: [{ title: { contains: q } }] },
      select: { id: true, title: true, owner: { select: { name: true } } },
      take: 5, orderBy: { lastUpdated: "desc" },
    }),
    prisma.knowledgeFile.findMany({
      where: { name: { contains: q } },
      select: { id: true, name: true, category: true },
      take: 5,
    }),
  ]);

  return success({
    users: users.map(u => ({ ...u, label: `${u.name} (${u.email})`, type: "user" })),
    projects: projects.map(p => ({ id: p.id, title: p.title, userName: p.owner?.name, label: p.title, type: "project" })),
    knowledge: knowledge.map(k => ({ ...k, label: k.name, type: "knowledge" })),
  });
}

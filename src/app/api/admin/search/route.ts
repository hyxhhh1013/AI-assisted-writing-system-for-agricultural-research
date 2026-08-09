import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  if (!q.trim()) {
    return success({
      users: [],
      projects: [],
      knowledge: [],
      directions: [],
      agentSessions: [],
    });
  }

  const [users, projects, knowledge, directions, agentSessions] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      select: { id: true, name: true, email: true, role: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: { OR: [{ title: { contains: q } }] },
      select: { id: true, title: true, owner: { select: { name: true } } },
      take: 5,
      orderBy: { lastUpdated: "desc" },
    }),
    prisma.knowledgeFile.findMany({
      where: { name: { contains: q } },
      select: { id: true, name: true, category: true },
      take: 5,
    }),
    prisma.direction.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { slug: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, name: true, slug: true, status: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.agentSession.findMany({
      where: {
        OR: [
          { goal: { contains: q } },
          { id: { contains: q } },
          { directionSlug: { contains: q } },
        ],
      },
      select: { id: true, goal: true, status: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return success({
    users: users.map((u) => ({ ...u, label: `${u.name} (${u.email})`, type: "user" as const })),
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      userName: p.owner?.name,
      label: p.title,
      type: "project" as const,
    })),
    knowledge: knowledge.map((k) => ({ ...k, label: k.name, type: "knowledge" as const })),
    directions: directions.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      status: d.status,
      label: d.name,
      type: "direction" as const,
    })),
    agentSessions: agentSessions.map((s) => ({
      id: s.id,
      goal: s.goal,
      status: s.status,
      label: s.goal.slice(0, 80) || s.id,
      type: "agent_session" as const,
    })),
  });
}

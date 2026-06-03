import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound } from "@/lib/admin-response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const { id } = await params;
  const check = await prisma.plagiarismCheck.findUnique({
    where: { id },
    include: {
      matches: { orderBy: { similarity: "desc" }, take: 100 },
      rewrites: true,
    },
  });
  if (!check) return notFound("查重记录不存在");

  return success({
    ...check,
    createdAt: check.createdAt.toISOString(),
    completedAt: check.completedAt?.toISOString() ?? null,
  });
}

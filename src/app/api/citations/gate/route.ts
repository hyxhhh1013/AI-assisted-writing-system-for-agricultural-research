/**
 * GET/POST /api/citations/gate — W3-CITE-GATE 全稿引用硬检
 */

import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";
import { validateBody } from "@/lib/api-validate";
import { citationGateSchema } from "@/lib/validations";
import { evaluateCitationGate } from "@/lib/citation-gate";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { getErrorMessage } from "@/lib/error-utils";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      abstract: true,
      sections: { select: { content: true } },
      references: { select: { id: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ success: false, error: "缺少 projectId" }, { status: 400 });
  }

  try {
    const project = await loadOwnedProject(projectId, userId);
    if (!project) {
      return Response.json({ success: false, error: "项目不存在或无权访问" }, { status: 404 });
    }

    const gate = evaluateCitationGate({
      texts: [project.abstract ?? "", ...project.sections.map((s) => s.content)],
      refCount: project.references.length,
    });

    await syncProjectPaperPassport(projectId).catch(() => null);

    return Response.json({ success: true, gate });
  } catch (error: unknown) {
    return Response.json(
      { success: false, error: getErrorMessage(error) || "引用硬检失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  try {
    const { data, errorResponse: ve } = await validateBody(
      citationGateSchema,
      await request.json(),
    );
    if (ve) return ve;

    if (data.projectId) {
      const project = await loadOwnedProject(data.projectId, userId);
      if (!project) {
        return Response.json({ success: false, error: "项目不存在或无权访问" }, { status: 404 });
      }
      const gate = evaluateCitationGate({
        texts: [project.abstract ?? "", ...project.sections.map((s) => s.content)],
        refCount: project.references.length,
      });
      await syncProjectPaperPassport(data.projectId).catch(() => null);
      return Response.json({ success: true, gate });
    }

    const gate = evaluateCitationGate({
      texts: data.texts ?? [],
      refCount: data.refCount ?? 0,
    });
    return Response.json({ success: true, gate });
  } catch (error: unknown) {
    return Response.json(
      { success: false, error: getErrorMessage(error) || "引用硬检失败" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { argumentBlueprintPayloadSchema } from "@/lib/validations";
import {
  readArgumentBlueprint,
  writeArgumentBlueprint,
} from "@/lib/project-argument-blueprint-db";
import { serializeArgumentBlueprint, parseArgumentBlueprint } from "@/contracts/argument-blueprint";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function assertOwner(projectId: string, userId: string): Promise<boolean> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  return Boolean(owned);
}

/** GET /api/projects/:id/argument-blueprint */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!(await assertOwner(projectId, userId))) {
      return NextResponse.json({ error: "项目未找到" }, { status: 404 });
    }
    const raw = await readArgumentBlueprint(projectId);
    return NextResponse.json({ argumentBlueprint: parseArgumentBlueprint(raw) });
  } catch (error: unknown) {
    logger.error("Argument-blueprint GET failed:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/** PUT /api/projects/:id/argument-blueprint — 保存/确认论证蓝图 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!(await assertOwner(projectId, userId))) {
      return NextResponse.json({ error: "项目未找到" }, { status: 404 });
    }

    const { data, errorResponse } = await validateBody(
      argumentBlueprintPayloadSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    await writeArgumentBlueprint(projectId, serializeArgumentBlueprint(data));
    const passport = await syncProjectPaperPassport(projectId);

    return NextResponse.json({
      argumentBlueprint: data,
      paperPassport: passport,
    });
  } catch (error: unknown) {
    logger.error("Argument-blueprint PUT failed:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

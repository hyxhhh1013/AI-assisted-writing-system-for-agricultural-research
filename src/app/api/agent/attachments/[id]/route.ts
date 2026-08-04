import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import prisma from "@/lib/prisma";
import { deleteAttachment } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";

const log = createLogger("api/agent/attachments/[id]");

/** GET /api/agent/attachments/[id] — 单附件信息（前端轮询异步提取状态） */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });
  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }
  try {
    const { id } = await params;
    const row = await prisma.agentAttachment.findFirst({
      where: { id, userId },
      select: {
        id: true, originalName: true, mimeType: true, size: true,
        status: true, extractSource: true, extractedText: true, pinned: true, createdAt: true,
      },
    });
    if (!row) return NextResponse.json({ error: "附件不存在或无权访问" }, { status: 404 });
    const text = row.extractedText ?? "";
    return NextResponse.json({
      attachment: {
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        status: row.status,
        extractSource: row.extractSource,
        charCount: text.length,
        truncated: row.status === "ready" && text.length > 0,
        pinned: row.pinned,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    log.fail("读取附件失败", error);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

/** DELETE /api/agent/attachments/[id]?sessionId= — 删除附件（DB 记录 + 磁盘文件） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 先鉴权（401）再暴露功能开关（503），与上传路由一致
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });

  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const sessionId = req.nextUrl.searchParams.get("sessionId") ?? undefined;
    const ok = await deleteAttachment(userId, sessionId, id);
    if (!ok) {
      return NextResponse.json({ error: "附件不存在或无权访问" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    log.fail("删除附件失败", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}

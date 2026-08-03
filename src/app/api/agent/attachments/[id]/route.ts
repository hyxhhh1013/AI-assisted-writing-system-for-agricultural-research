import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { deleteAttachment } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";

const log = createLogger("api/agent/attachments/[id]");

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

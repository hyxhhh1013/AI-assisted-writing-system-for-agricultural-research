import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { assertProjectOwnedByUser } from "@/lib/plagiarism-access";
import { pinAttachment } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";

const log = createLogger("api/agent/attachments/[id]/pin");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 先鉴权（401）再暴露功能开关（503），避免匿名探测 Agent 是否启用（与 attachments 上传路由一致）
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });

  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    if (!(await assertProjectOwnedByUser(projectId, userId))) {
      return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
    }

    const attachment = await pinAttachment(userId, id, projectId);
    if (!attachment) {
      return NextResponse.json({ error: "附件不存在或无权访问" }, { status: 404 });
    }
    return NextResponse.json({ attachment });
  } catch (error: unknown) {
    log.fail("固定附件失败", error);
    return NextResponse.json({ error: "固定失败" }, { status: 500 });
  }
}

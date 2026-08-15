import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { AttachmentValidationError, createAttachmentFromFile } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const log = createLogger("api/agent/attachments");

export async function POST(req: NextRequest) {
  // 先鉴权（401）再暴露功能开关（503），避免匿名探测 Agent 是否启用
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });

  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文件（字段名 file）" }, { status: 400 });
    }
    const sessionIdRaw = formData.get("sessionId");
    const sessionId =
      typeof sessionIdRaw === "string" && sessionIdRaw.trim() ? sessionIdRaw.trim() : undefined;
    const projectIdRaw = formData.get("projectId");
    const projectId =
      typeof projectIdRaw === "string" && projectIdRaw.trim() ? projectIdRaw.trim() : undefined;

    const attachment = await createAttachmentFromFile(userId, sessionId, file, projectId);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AttachmentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.fail("上传附件失败", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

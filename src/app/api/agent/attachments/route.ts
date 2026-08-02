import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-utils";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { createAttachmentFromFile } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文件（字段名 file）" }, { status: 400 });
    }
    const sessionIdRaw = formData.get("sessionId");
    const sessionId =
      typeof sessionIdRaw === "string" && sessionIdRaw.trim() ? sessionIdRaw.trim() : undefined;

    const attachment = await createAttachmentFromFile(userId, sessionId, file);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || "上传失败" }, { status: 400 });
  }
}

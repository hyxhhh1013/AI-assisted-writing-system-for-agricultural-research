import { randomUUID } from "crypto";
import { ATTACHMENT_ALLOWED_EXTENSIONS, MAX_ATTACHMENT_BYTES } from "@/lib/agent/attachments/constants";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";
import { deleteAttachmentFile, readAttachmentFile, writeAttachmentFile } from "@/lib/agent/attachments/storage";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import prisma from "@/lib/prisma";
import type { AgentAttachmentInfo, AttachmentExtractSource } from "@/contracts/agent-attachment";

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function assertAttachmentAcceptable(file: { name: string; size: number }): void {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`文件过大（上限 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB）`);
  }
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(extOf(file.name))) {
    throw new Error(`不支持的文件类型：${file.name}（允许 ${[...ATTACHMENT_ALLOWED_EXTENSIONS].join("/")}）`);
  }
}

export async function createAttachmentFromFile(
  userId: string,
  sessionId: string | undefined,
  file: File,
): Promise<AgentAttachmentInfo> {
  assertAttachmentAcceptable(file);
  const attachmentId = randomUUID();
  const buf = Buffer.from(await file.arrayBuffer());
  // 一次落盘拿到 fileKey，再交给提取层（fileKey 即相对路径，DB 只存它）
  const fileKey = writeAttachmentFile(userId, attachmentId, file.name, buf);

  let status: AgentAttachmentInfo["status"] = "ready";
  let extractedText: string | null = null;
  let extractSource: AttachmentExtractSource | null = null;
  let truncated = false;
  let charCount = 0;
  try {
    const result = await extractAttachmentText(
      resolveProjectRuntimePath(fileKey),
      file.name,
    );
    if (result.status === "ready") {
      extractedText = result.text ?? null;
      charCount = result.charCount ?? (result.text?.length ?? 0);
      truncated = result.truncated ?? false;
      extractSource = result.source;
    } else {
      status = result.status === "unsupported" ? "unsupported" : "extract_failed";
      extractSource = result.source;
    }
  } catch {
    status = "extract_failed";
    extractSource = "failed";
  }

  const row = await prisma.agentAttachment.create({
    data: {
      id: attachmentId,
      userId,
      sessionId: sessionId ?? null,
      fileKey,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buf.length,
      status,
      extractSource,
      extractedText,
    },
  });
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status,
    extractSource: row.extractSource as AttachmentExtractSource | null,
    charCount,
    truncated,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function pinAttachment(
  userId: string,
  attachmentId: string,
  projectId: string,
): Promise<AgentAttachmentInfo | null> {
  const row = await prisma.agentAttachment.updateMany({
    where: { id: attachmentId, userId },
    data: { projectId, pinned: true },
  });
  if (row.count === 0) return null;
  const updated = await prisma.agentAttachment.findUnique({ where: { id: attachmentId } });
  if (!updated) return null;
  return {
    id: updated.id,
    originalName: updated.originalName,
    mimeType: updated.mimeType,
    size: updated.size,
    status: updated.status,
    extractSource: updated.extractSource as AttachmentExtractSource | null,
    pinned: updated.pinned,
    createdAt: updated.createdAt.toISOString(),
  };
}

export { deleteAttachmentFile, readAttachmentFile };

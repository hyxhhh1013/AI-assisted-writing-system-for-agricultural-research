import { randomUUID } from "crypto";
import { ATTACHMENT_ALLOWED_EXTENSIONS, MAX_ATTACHMENT_BYTES } from "@/lib/agent/attachments/constants";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";
import { deleteAttachmentFile, readAttachmentFile, writeAttachmentFile } from "@/lib/agent/attachments/storage";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import prisma from "@/lib/prisma";
import type { AgentAttachmentInfo, AttachmentExtractSource } from "@/contracts/agent-attachment";

/** 客户端输入不合法（超限/类型不支持）——路由据此返回 400，不视为服务端错误 */
export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

/** Postgres text 字段不允许 NUL（\x00）；兜底清洗所有入库文本（图片描述等不走 extract.truncateTo） */
function sanitizeTextForDb(text: string | null): string | null {
  return text?.replace(/\x00/g, "") ?? null;
}

export function assertAttachmentAcceptable(file: { name: string; size: number }): void {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError(`文件过大（上限 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB）`);
  }
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(extOf(file.name))) {
    throw new AttachmentValidationError(`不支持的文件类型：${file.name}（允许 ${[...ATTACHMENT_ALLOWED_EXTENSIONS].join("/")}）`);
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
  // 一次落盘拿到 fileKey（fileKey 即相对路径，DB 只存它）
  const fileKey = writeAttachmentFile(userId, attachmentId, file.name, buf);

  let row;
  try {
    // 先落库为 extracting，立即返回——提取（含 PDF 页面 GLM-4V）放后台完成，
    // 上传响应不再阻塞等待，用户可继续操作。
    row = await prisma.agentAttachment.create({
      data: {
        id: attachmentId,
        userId,
        sessionId: sessionId ?? null,
        fileKey,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: buf.length,
        status: "extracting",
        extractSource: null,
        extractedText: null,
      },
    });
  } catch (error) {
    // DB 写入失败：清理已落盘的孤儿文件后重抛，避免残留无主文件
    deleteAttachmentFile(userId, attachmentId);
    throw error;
  }

  // 后台异步提取：不阻塞上传响应；完成后更新记录状态与文本。
  // fire-and-forget：PM2 standalone 常驻，Node 事件循环会等它跑完。
  void extractAttachmentInBackground(attachmentId, userId, fileKey, file.name);

  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status as AgentAttachmentInfo["status"],
    extractSource: null,
    pinned: false,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 后台提取附件文本（图片走 GLM-4V；PDF 渲染前 N 页视觉理解），完成后更新记录 */
async function extractAttachmentInBackground(
  attachmentId: string,
  userId: string,
  fileKey: string,
  originalName: string,
): Promise<void> {
  await runAttachmentExtraction(attachmentId, userId, fileKey, originalName);
}

/** 执行提取并落库；成功返回 true，失败标记 extract_failed 并返回 false。供上传后台 / 失败重试共用。 */
export async function runAttachmentExtraction(
  attachmentId: string,
  userId: string,
  fileKey: string,
  originalName: string,
): Promise<boolean> {
  try {
    const result = await extractAttachmentText(
      resolveProjectRuntimePath(fileKey),
      originalName,
    );
    await prisma.agentAttachment.update({
      where: { id: attachmentId },
      data: {
        status: result.status === "ready"
          ? "ready"
          : result.status === "unsupported"
            ? "unsupported"
            : "extract_failed",
        extractSource: result.source,
        extractedText: sanitizeTextForDb(result.text ?? null),
      },
    });
    return result.status === "ready";
  } catch (error) {
    // 提取失败标记 extract_failed（附件仍保留，用户可删/重传/重试）
    await prisma.agentAttachment
      .update({
        where: { id: attachmentId },
        data: { status: "extract_failed", extractSource: "failed" },
      })
      .catch(() => {});
    return false;
  }
}

/** 提取失败后重试：文件仍在则重新提取，成功返回 true。供 read_attachment 遇 extract_failed 自动重试。 */
export async function retryAttachmentExtraction(
  attachmentId: string,
  userId: string,
  fileKey: string,
  originalName: string,
): Promise<boolean> {
  try {
    // 文件不存在/不可读直接失败（避免反复重试）
    readAttachmentFile(userId, attachmentId);
  } catch {
    return false;
  }
  return runAttachmentExtraction(attachmentId, userId, fileKey, originalName);
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

/** 删除附件：删 DB 记录 + 同步删磁盘文件，避免孤儿文件。归属按 userId + sessionId。 */
export async function deleteAttachment(
  userId: string,
  sessionId: string | undefined,
  attachmentId: string,
): Promise<boolean> {
  const row = await prisma.agentAttachment.findFirst({
    where: { id: attachmentId, userId },
    select: { id: true, sessionId: true },
  });
  if (!row) return false;
  // 会话级隔离：提供 sessionId 时，仅允许删除本会话（或不属于任何会话）的附件
  if (sessionId && row.sessionId && row.sessionId !== sessionId) {
    return false;
  }
  await prisma.agentAttachment.delete({ where: { id: attachmentId } });
  deleteAttachmentFile(userId, attachmentId);
  return true;
}

export { deleteAttachmentFile, readAttachmentFile };

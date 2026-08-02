import fs from "fs";
import path from "path";
import { assertSafePathSegment } from "@/lib/safe-path";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import { ATTACHMENT_ROOT } from "@/lib/agent/attachments/constants";

/** 净化文件名：去掉目录段与控制字符，保扩展名，截断 128 字符 */
export function sanitizeAttachmentName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\0-\x1f]/g, "");
  const cleaned = base.length > 128 ? `${base.slice(0, 128 - 8)}${base.slice(-8)}` : base;
  return cleaned.trim() || "file";
}

export function attachmentDir(userId: string, attachmentId: string): string {
  assertSafePathSegment(userId, "userId");
  assertSafePathSegment(attachmentId, "attachmentId");
  return path.join(ATTACHMENT_ROOT, userId, attachmentId);
}

/** 写文件，返回 fileKey（相对路径，供 DB 存） */
export function writeAttachmentFile(
  userId: string,
  attachmentId: string,
  originalName: string,
  data: Buffer,
): string {
  const dirRel = attachmentDir(userId, attachmentId);
  const dirAbs = resolveProjectRuntimePath(dirRel);
  fs.mkdirSync(dirAbs, { recursive: true });
  const safeName = sanitizeAttachmentName(originalName);
  const fileKey = path.posix.join(dirRel, safeName);
  fs.writeFileSync(resolveProjectRuntimePath(fileKey), data);
  return fileKey;
}

export function readAttachmentFile(userId: string, attachmentId: string): Buffer {
  const dirAbs = resolveProjectRuntimePath(attachmentDir(userId, attachmentId));
  const entries = fs.readdirSync(dirAbs);
  if (entries.length === 0) throw new Error("附件文件缺失");
  return fs.readFileSync(path.join(dirAbs, entries[0]));
}

export function deleteAttachmentFile(userId: string, attachmentId: string): void {
  const dirAbs = resolveProjectRuntimePath(attachmentDir(userId, attachmentId));
  fs.rmSync(dirAbs, { recursive: true, force: true });
}

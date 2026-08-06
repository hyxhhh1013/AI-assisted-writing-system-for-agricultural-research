import fs from "fs";
import path from "path";
import { assertSafePathSegment } from "@/lib/safe-path";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import { ATTACHMENT_ROOT } from "@/lib/agent/attachments/constants";

/** 净化文件名：去掉目录段与控制字符，保扩展名，截断 128 字符 */
export function sanitizeAttachmentName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\0-\x1f]/g, "");
  const cleaned = base.length > 128 ? `${base.slice(0, 128 - 8)}${base.slice(-8)}` : base;
  const trimmed = cleaned.trim();
  // 裸 "." / ".." 会越界，统一回退（判断在 truncate 之后、返回之前）
  if (trimmed === "." || trimmed === "..") return "file";
  return trimmed || "file";
}

export function attachmentDir(userId: string, attachmentId: string): string {
  assertSafePathSegment(userId, "userId");
  assertSafePathSegment(attachmentId, "attachmentId");
  // 纯 posix：fileKey 为落库标识，需跨平台一致（Windows 开发 / Linux 生产）
  return path.posix.join(ATTACHMENT_ROOT, userId, attachmentId);
}

/** rootOverride 仅供测试注入临时根目录 */
function resolveAbs(rel: string, rootOverride?: string): string {
  return rootOverride ? path.join(rootOverride, rel) : resolveProjectRuntimePath(rel);
}

/** 写文件，返回 fileKey（相对路径，供 DB 存） */
export function writeAttachmentFile(
  userId: string,
  attachmentId: string,
  originalName: string,
  data: Buffer,
  rootOverride?: string,
): string {
  const dirRel = attachmentDir(userId, attachmentId);
  const dirAbs = resolveAbs(dirRel, rootOverride);
  fs.mkdirSync(dirAbs, { recursive: true });
  const safeName = sanitizeAttachmentName(originalName);
  const fileKey = path.posix.join(dirRel, safeName);
  fs.writeFileSync(resolveAbs(fileKey, rootOverride), data);
  return fileKey;
}

export function readAttachmentFile(
  userId: string,
  attachmentId: string,
  rootOverride?: string,
): Buffer {
  const dirAbs = resolveAbs(attachmentDir(userId, attachmentId), rootOverride);
  let entries: string[];
  try {
    entries = fs.readdirSync(dirAbs);
  } catch {
    throw new Error("附件文件缺失");
  }
  if (entries.length === 0) throw new Error("附件文件缺失");
  return fs.readFileSync(path.join(dirAbs, entries[0]));
}

export function deleteAttachmentFile(
  userId: string,
  attachmentId: string,
  rootOverride?: string,
): void {
  const dirAbs = resolveAbs(attachmentDir(userId, attachmentId), rootOverride);
  fs.rmSync(dirAbs, { recursive: true, force: true });
}

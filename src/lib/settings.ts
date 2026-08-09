/**
 * 系统设置 — 加密 key-value 存储
 * Key 存明文，Value 用 AES-256-GCM 加密后存 SQLite
 */

import crypto from "crypto";
import prisma from "@/lib/prisma";

// ==================== 加密 ====================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** 从环境变量或默认值派生加密密钥（32 字节 = AES-256） */
function getEncryptionKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || "grainscript-default-settings-key-2026";
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // 格式: iv + authTag + encrypted (全部 base64)
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ==================== CRUD ====================

/** 检查 key 是否存在（不解密） */
export async function hasSetting(key: string): Promise<boolean> {
  const count = await prisma.systemSetting.count({ where: { key } });
  return count > 0;
}

/** 获取单个设置（解密后明文）。解密失败时返回 null 并打印 warning */
export async function getSetting(key: string): Promise<string | null> {
  const record = await prisma.systemSetting.findUnique({ where: { key } });
  if (!record) return null;
  try {
    return decrypt(record.value);
  } catch {
    console.warn(`[settings] 解密 ${key} 失败（加密密钥可能已变更），请在 Admin 页面重新设置`);
    return null;
  }
}

/** 设置一个 key-value（加密后存储）*/
export async function setSetting(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: encrypted },
    create: { key, value: encrypted },
  });
}

/** 删除一个设置 */
export async function deleteSetting(key: string): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key } });
}

/** 获取所有设置（key 明文，value 脱敏；模型名等非密钥完整展示）*/
export async function getAllSettings(): Promise<Array<{ key: string; maskedValue: string; updatedAt: string }>> {
  const records = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  return records.map(r => {
    let masked = "****";
    try {
      const decrypted = decrypt(r.value);
      if (
        /_MODEL$/i.test(r.key)
        || r.key.includes("MODEL_NAME")
        || r.key.startsWith("AGENT_ROLE_") // 角色映射值是非敏感 provider 名
        || /^(ENABLE_|WRITING_|AGENT_WRITE_|JOURNAL_METRICS_)/.test(r.key) // 运维开关/导入摘要明文展示
      ) {
        masked = decrypted;
      } else if (decrypted.length <= 8) {
        masked = "****";
      } else {
        masked = decrypted.slice(0, 4) + "****" + decrypted.slice(-4);
      }
    } catch { }
    return { key: r.key, maskedValue: masked, updatedAt: r.updatedAt.toISOString() };
  });
}

/** 初始化默认设置（仅当 DB 中不存在该 key 时，才从环境变量迁移） */
export async function initDefaultSettings(): Promise<void> {
  const defaults: [string, string | undefined][] = [
    ["DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY],
    ["ZHIPU_API_KEY", process.env.ZHIPU_API_KEY],
    ["DEEPSEEK_MODEL", process.env.DEEPSEEK_MODEL],
    ["ZHIPU_MODEL", process.env.ZHIPU_MODEL],
  ];

  for (const [key, envValue] of defaults) {
    if (!envValue) continue;
    const exists = await hasSetting(key);
    if (exists) continue; // 已存在则不覆盖（即使无法解密也保留，等用户手动修改）
    await setSetting(key, envValue);
    console.log(`[settings] 已从环境变量迁移: ${key}`);
  }
}

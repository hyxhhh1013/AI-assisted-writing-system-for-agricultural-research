/**
 * Phase 5b — 双语摘要（中英对照）
 * 主语言写入 Project.abstract；对照语言写入 Passport.abstractSnapshot。
 */
export interface BilingualAbstract {
  version: 1;
  zh: string;
  en: string;
  /** 与生成时正文哈希（可选，便于过期提示） */
  sourceHash?: string;
  generatedAt: number;
}

export function isBilingualAbstract(value: unknown): value is BilingualAbstract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1
    && typeof v.zh === "string"
    && v.zh.trim().length > 0
    && typeof v.en === "string"
    && v.en.trim().length > 0
    && typeof v.generatedAt === "number"
  );
}

export function parseBilingualAbstract(raw: string | null | undefined): BilingualAbstract | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isBilingualAbstract(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeBilingualAbstract(value: BilingualAbstract): string {
  return JSON.stringify(value);
}

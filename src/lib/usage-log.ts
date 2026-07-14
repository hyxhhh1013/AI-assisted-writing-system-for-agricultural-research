/**
 * 功能使用日志：内存环形缓冲（开发即时查看）+ Prisma AiUsageLog（持久化，供 Admin）。
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type UsageLogEntry = {
  feature: string;
  userId?: string;
  userLabel?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

const MAX_ENTRIES = 2000;
const logs: UsageLogEntry[] = [];

function prune() {
  while (logs.length > MAX_ENTRIES) logs.shift();
}

function extractTokens(metadata?: Record<string, unknown>): number | undefined {
  if (!metadata) return undefined;
  const candidates = [metadata.tokens, metadata.totalTokens, metadata.promptTokens, metadata.completionTokens];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  }
  return undefined;
}

function persistToDatabase(entry: UsageLogEntry) {
  try {
    const delegate = prisma.aiUsageLog;
    if (!delegate?.create) return;

    const userId = entry.userId && entry.userId !== "anonymous" ? entry.userId : null;
    void delegate
      .create({
        data: {
          userId,
          feature: entry.feature,
          tokens: extractTokens(entry.metadata),
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      })
      .catch(() => {
        /* 持久化失败不阻塞 AI 主路径 */
      });
  } catch {
    /* 旧版 Prisma 单例或表未迁移时跳过 */
  }
}

export const usageLog = {
  record(feature: string, metadata?: Record<string, unknown>, userId?: string) {
    try {
      const entry: UsageLogEntry = {
        feature,
        userId: userId ?? "anonymous",
        timestamp: Date.now(),
        metadata,
      };
      logs.push(entry);
      prune();
      persistToDatabase(entry);
    } catch {
      /* 内存/DB 任一环节失败均不向外抛 */
    }
  },

  countSince(feature: string, minutes: number): number {
    const threshold = Date.now() - minutes * 60_000;
    return logs.filter((e) => e.feature === feature && e.timestamp >= threshold).length;
  },

  recent(n = 50): UsageLogEntry[] {
    return logs.slice(-n).reverse();
  },

  stats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of logs) counts[e.feature] = (counts[e.feature] || 0) + 1;
    return counts;
  },

  clear() {
    logs.length = 0;
  },
};

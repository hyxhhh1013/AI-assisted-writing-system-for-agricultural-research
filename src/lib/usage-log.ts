/**
 * 轻量级功能使用日志。记录 AI 端点和关键功能调用，用于判断哪些功能是刚需。
 * 日志只存内存，重启丢失——如需持久化，在生产环境接入外部日志服务。
 */
type LogEntry = {
  feature: string;
  userId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

const MAX_ENTRIES = 2000;
const logs: LogEntry[] = [];

function prune() {
  while (logs.length > MAX_ENTRIES) logs.shift();
}

export const usageLog = {
  record(feature: string, metadata?: Record<string, unknown>, userId?: string) {
    logs.push({
      feature,
      userId: userId ?? "anonymous",
      timestamp: Date.now(),
      metadata,
    });
    prune();
  },

  /** 过去 N 分钟的调用次数 */
  countSince(feature: string, minutes: number): number {
    const threshold = Date.now() - minutes * 60_000;
    return logs.filter((e) => e.feature === feature && e.timestamp >= threshold).length;
  },

  /** 最近 N 条日志 */
  recent(n = 50): LogEntry[] {
    return logs.slice(-n).reverse();
  },

  /** 各功能调用分布 */
  stats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of logs) counts[e.feature] = (counts[e.feature] || 0) + 1;
    return counts;
  },

  /** 清空 */
  clear() {
    logs.length = 0;
  },
};

/**
 * 统一日志工具，替代直接使用 console。
 * - info / debug：仅 development 输出，生产静默。
 * - warn / error：所有环境输出，保证线上可观测。
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args); },
  info:  (...args: unknown[]) => { if (isDev) console.info(...args); },
  warn:  (...args: unknown[]) => { console.warn(...args); },
  error: (...args: unknown[]) => { console.error(...args); },
};

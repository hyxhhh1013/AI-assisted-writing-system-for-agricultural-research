/**
 * 统一日志：带 scope 前缀 + 可选结构化字段。
 * - debug / info：仅 development
 * - warn / error：全环境（生产为单行 JSON，便于采集）
 */
export type LogFields = Record<string, unknown>;

export type Logger = {
  debug: (message: string, fieldsOrExtra?: LogFields | unknown) => void;
  info: (message: string, fieldsOrExtra?: LogFields | unknown) => void;
  warn: (message: string, fieldsOrExtra?: LogFields | unknown) => void;
  error: (message: string, fieldsOrExtra?: LogFields | unknown) => void;
  /** 从 unknown 错误提取 message/stack（dev）写入 fields */
  fail: (message: string, error: unknown, fields?: LogFields) => void;
};

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function normalizeFields(fieldsOrExtra?: LogFields | unknown): LogFields | undefined {
  if (fieldsOrExtra === undefined) return undefined;
  if (fieldsOrExtra instanceof Error) {
    const out: LogFields = { error: fieldsOrExtra.message };
    if (isDev() && fieldsOrExtra.stack) out.stack = fieldsOrExtra.stack;
    return out;
  }
  if (typeof fieldsOrExtra === "object" && fieldsOrExtra !== null && !Array.isArray(fieldsOrExtra)) {
    return fieldsOrExtra as LogFields;
  }
  return { detail: fieldsOrExtra };
}

function write(
  level: "debug" | "info" | "warn" | "error",
  scope: string,
  message: string,
  fields?: LogFields,
) {
  if ((level === "debug" || level === "info") && !isDev()) return;

  const payload: LogFields = { scope, message, ...fields };

  if (isDev()) {
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "info"
            ? console.info
            : console.debug;
    fn(`[${scope}]`, message, fields && Object.keys(fields).length > 0 ? fields : "");
    return;
  }

  if (level === "warn" || level === "error") {
    console.error(
      JSON.stringify({
        level,
        at: new Date().toISOString(),
        ...payload,
      }),
    );
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, fieldsOrExtra) =>
      write("debug", scope, message, normalizeFields(fieldsOrExtra)),
    info: (message, fieldsOrExtra) =>
      write("info", scope, message, normalizeFields(fieldsOrExtra)),
    warn: (message, fieldsOrExtra) =>
      write("warn", scope, message, normalizeFields(fieldsOrExtra)),
    error: (message, fieldsOrExtra) =>
      write("error", scope, message, normalizeFields(fieldsOrExtra)),
    fail: (message, error, fields) => {
      const errFields: LogFields = {
        ...fields,
        error: error instanceof Error ? error.message : String(error),
      };
      if (isDev() && error instanceof Error && error.stack) {
        errFields.stack = error.stack;
      }
      write("error", scope, message, errFields);
    },
  };
}

/** 默认 scope，兼容旧代码 `import { logger } from '@/lib/logger'` */
export const logger: Logger = createLogger("app");

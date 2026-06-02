/** 统一错误处理工具 */

import { createLogger } from "@/lib/logger";

const log = createLogger("error-utils");

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "操作失败";
}

export function logError(context: string, error: unknown): void {
  log.fail(context, error);
}

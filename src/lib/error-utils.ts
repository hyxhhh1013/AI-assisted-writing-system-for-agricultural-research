/** 统一错误处理工具 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "操作失败";
}

export function logError(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.error(`[${context}]`, error);
  }
}

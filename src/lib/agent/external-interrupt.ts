/** 后台按钮和运维 MCP 写入的中断原因。运行中的回合不能把这两种状态盖回去。 */

export const ADMIN_INTERRUPT_MESSAGE = "管理员强制中断";
export const OPS_INTERRUPT_MESSAGE = "运维 MCP 强制中断";

const EXTERNAL_INTERRUPT_MESSAGES = [ADMIN_INTERRUPT_MESSAGE, OPS_INTERRUPT_MESSAGE] as const;

export function isExternalInterruptMessage(message: string | null | undefined): boolean {
  return (EXTERNAL_INTERRUPT_MESSAGES as readonly string[]).includes(message ?? "");
}

/** 下一状态若不是继续保持 interrupted，就不能覆盖外部中断。 */
export function externalInterruptBlocksStatusWrite(
  currentStatus: string | null | undefined,
  currentMessage: string | null | undefined,
  nextStatus: string | undefined,
): boolean {
  if (!nextStatus || nextStatus === "interrupted") return false;
  return currentStatus === "interrupted" && isExternalInterruptMessage(currentMessage);
}

import type { AgentUiMessage } from "@/contracts/agent-session";

/**
 * 在 messages[fromExclusive+1 ..] 中找最新的成功 open_blueprint_workspace。
 * 用于「仅对新追加 observation 自动打开蓝图」，避免会话恢复/重挂载误弹。
 */
export function findNewBlueprintOpenIndex(
  messages: readonly AgentUiMessage[],
  fromExclusive: number,
): number {
  const start = Math.max(0, fromExclusive + 1);
  for (let i = start; i < messages.length; i++) {
    const m = messages[i];
    if (
      m?.kind === "observation"
      && m.tool === "open_blueprint_workspace"
      && !m.error
    ) {
      return i;
    }
  }
  return -1;
}

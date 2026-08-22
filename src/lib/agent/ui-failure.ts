import type { AgentUiMessage } from "@/contracts/agent-session";
import type { AgentStatus } from "@/contracts/agent";

/** 检索无命中是软结果，不应做成红框「再试一次」 */
export function isSoftSearchMiss(text: string | undefined | null): boolean {
  if (!text) return false;
  return /无命中|缩短查询|换更简洁的 query|换英文关键词|不是任务失败/.test(text);
}

/** 流水线门禁提示：模型走错步，不是用户要重试的失败 */
export function isPipelineNudge(text: string | undefined | null): boolean {
  if (!text) return false;
  return /引用修正阶段|引用检查阶段|完成后再 write_bilingual_abstract|请先 read_section \+ refine_content|停止空转读取|连续.+\d+ 次读取同一章节|已因连续重复读取被隔离|硬检已通过，剩余为软可疑/.test(
    text,
  );
}

function isBenignAgentNotice(text: string | undefined | null): boolean {
  return isSoftSearchMiss(text) || isPipelineNudge(text);
}

export function resolveAgentLastFailure(input: {
  status: AgentStatus | "idle" | string;
  messages: readonly AgentUiMessage[];
}): string | null {
  if (input.status !== "error") return null;

  let sawSoft = false;
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const m = input.messages[i];
    if (m.kind === "observation" && m.error) {
      if (isBenignAgentNotice(m.error)) {
        sawSoft = true;
        continue;
      }
      return m.error;
    }
    if (m.kind === "summary" && /失败|错误|无法/.test(m.summary.text)) {
      if (isBenignAgentNotice(m.summary.text)) {
        sawSoft = true;
        continue;
      }
      return m.summary.text.slice(0, 160);
    }
  }
  if (sawSoft) return null;
  return "执行失败，可再试一次。";
}

import type { LLMMessage } from "@/lib/agent/types";

/** 保留最近全量的消息数（其余早期轮次压缩） */
export const MAX_FULL_MESSAGES = 24;
/** 超过此消息数才压缩（避免频繁触发） */
export const MIN_COMPACT_MESSAGES = 32;
/** 旧 assistant 思考保留的最大字符（截断保住推理 gist） */
const OLD_THOUGHT_CAP = 120;
/** 整个输入（含 system）的 token 预算：超了即使条数不足也压缩 */
export const MAX_CONTEXT_TOKENS = 24_000;
/** keep 窗口内单条工具观察允许的最大 token，超长证据降级为摘要+片段 */
const MAX_KEEP_SINGLE_TOKENS = 1_500;
/** 降级时保留的证据片段长度（摘要行之后） */
const KEEP_DEGRADE_EVIDENCE_CHARS = 600;
/** write 工具名：最近一条对应观察不降级（agent 正在写/改的章节需见完整正文）；`):` 锚定避免误配 *_v2 等 */
const WRITE_OBS_PREFIXES = ["write_section", "refine_content", "write_bilingual_abstract"];

/**
 * 粗略 token 估算：CJK 每字符 ≈1 token，其余每 4 字符 ≈1 token。
 * 只用于触发/降级判断，不需要精确——量级正确即可。
 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

/** 从工具观察消息里提取摘要行（[tool] summary），丢弃冗长证据 */
function extractToolSummary(content: string): string | null {
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (/^\[[a-z_]+\]/.test(t) && !t.includes("【证据摘录】")) {
      return t.length > 160 ? `${t.slice(0, 160)}…` : t;
    }
  }
  return null;
}

/** 折叠连续 assistant 思考（旧窗口工具观察被抽走后可能出现），保持 user/assistant 大体交替 */
function mergeConsecutiveAssistant(msgs: LLMMessage[]): LLMMessage[] {
  const out: LLMMessage[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === "assistant" && m.role === "assistant") {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** 把超长的工具观察降级：摘要行 + 保留开头一段证据，防单条证据撑爆输入 */
function degradeToolObservation(content: string): string {
  const line = extractToolSummary(content) ?? "";
  const idx = content.indexOf("【证据摘录】");
  if (idx < 0) {
    return content.length > 400 ? `${content.slice(0, 400)}…` : content;
  }
  const evidence = content.slice(idx + "【证据摘录】".length).trim();
  const tail =
    evidence.length > KEEP_DEGRADE_EVIDENCE_CHARS
      ? `${evidence.slice(0, KEEP_DEGRADE_EVIDENCE_CHARS)}…`
      : evidence;
  return `${line}\n【证据摘录·截断】\n${tail}`;
}

/**
 * 压缩 agent 对话历史供 LLM 输入（不暴力丢信息）：
 * - 触发：消息条数超阈值，或估算 token 超预算（覆盖「条数不多但单条证据巨大」）
 * - 用户消息（目标/跟进/决策）全部保留——意图不丢
 * - 旧 assistant 思考截断到 120 字——保住推理脉络，连续思考折叠
 * - 旧工具观察 → 摘要行（丢弃证据，保留"做了什么"）
 * - 最近 MAX_FULL_MESSAGES 条全量；其中单条超长的工具观察降级为摘要+证据片段
 * 只压缩发给模型的视图，不改持久化状态。
 */
export function compactAgentMessages(messages: LLMMessage[]): LLMMessage[] {
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const overBudget = totalTokens > MAX_CONTEXT_TOKENS;
  if (messages.length <= MIN_COMPACT_MESSAGES && !overBudget) return messages;

  const keep = messages.slice(-MAX_FULL_MESSAGES);
  const old = messages.slice(0, messages.length - MAX_FULL_MESSAGES);

  const preserved: LLMMessage[] = [];
  const toolSummaries: string[] = [];

  for (const m of old) {
    if (m.role === "assistant") {
      const t = m.content.trim();
      if (t) {
        preserved.push({
          role: "assistant",
          content: t.length > OLD_THOUGHT_CAP ? `${t.slice(0, OLD_THOUGHT_CAP)}…` : t,
        });
      }
    } else if (m.content.startsWith("Tool result")) {
      const line = extractToolSummary(m.content);
      if (line) toolSummaries.push(line);
    } else {
      // 用户目标 / 跟进 / 决策 / 系统提示：完整保留（短而关键）
      preserved.push(m);
    }
  }

  const result: LLMMessage[] = mergeConsecutiveAssistant(preserved);

  if (toolSummaries.length > 0) {
    const unique = [...new Set(toolSummaries)].slice(-30);
    result.push({
      role: "user",
      content: `【已执行步骤摘要】\n${unique.join("\n")}\n如需某步细节，请用工具重新读取。`,
    });
  }

  // keep 窗口内最近一条 write 观察不降级（其余超长观察降级为摘要+片段）
  const lastWriteIdx = keep.findLastIndex((m) =>
    WRITE_OBS_PREFIXES.some((p) => m.content.startsWith(`Tool result (${p}):`)),
  );
  const trimmedKeep = keep.map((m, i) =>
    m.content.startsWith("Tool result")
    && estimateTokens(m.content) > MAX_KEEP_SINGLE_TOKENS
    && i !== lastWriteIdx
      ? { ...m, content: degradeToolObservation(m.content) }
      : m,
  );

  result.push(...trimmedKeep);
  return result;
}

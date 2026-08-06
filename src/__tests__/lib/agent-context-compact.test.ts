import { describe, expect, it } from "vitest";
import {
  compactAgentMessages,
  estimateTokens,
} from "@/lib/agent/core/context-compact";
import type { LLMMessage } from "@/lib/agent/types";

const obs = (tool: string, summary: string): LLMMessage => ({
  role: "user",
  content: `Tool result (${tool}):\n[${tool}] ${summary}\n【证据摘录】\n...long evidence...`,
});

/** 构造带指定长度证据的工具观察（用于触发 token 预算压缩） */
const bigObs = (tool: string, summary: string, evidenceChars: number): LLMMessage => ({
  role: "user",
  content: `Tool result (${tool}):\n[${tool}] ${summary}\n【证据摘录】\n${"长".repeat(evidenceChars)}`,
});

/** 明显超过 120 字截断阈值的思考文本 */
const longThought = (i: number) =>
  `这是第${i}步的完整思考与推理过程，包含了对文献的深入分析、对实验数据的定量解读、`
  + `对三种机制假说的权衡比较与取舍依据、以及下一步的行动计划与风险预案。`
  + `这段文字需要被截断以保留核心结论与推理方向，避免上下文无限膨胀影响后续推理质量。`
  + `为验证该结论，还需补充对照组实验并核对引用来源的年份与卷期页码信息，确保论证链条完整可靠。`;

describe("estimateTokens", () => {
  it("counts CJK as ~1 token and ASCII as ~4 chars per token", () => {
    expect(estimateTokens("你好世界")).toBe(4);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("hello 你好")).toBe(4);
  });
});

describe("compactAgentMessages", () => {
  it("keeps short conversations unchanged", () => {
    const msgs: LLMMessage[] = [
      { role: "user", content: "你好" },
      { role: "assistant", content: "好的" },
    ];
    expect(compactAgentMessages(msgs)).toBe(msgs);
  });

  it("compacts long conversations: keeps user intent + recent full", () => {
    const goal: LLMMessage = { role: "user", content: "帮我写综述" };
    const followUp: LLMMessage = { role: "user", content: "侧重化学机制" };
    const msgs: LLMMessage[] = [goal];
    for (let i = 0; i < 40; i++) {
      msgs.push(obs("search_knowledge", `第${i}次检索`));
      msgs.push({ role: "assistant", content: longThought(i) });
      if (i === 20) msgs.push(followUp);
    }
    const out = compactAgentMessages(msgs);
    expect(out.length).toBeLessThan(msgs.length);
    // 用户目标与跟进完整保留（意图不丢）
    expect(out.some((m) => m.content === "帮我写综述")).toBe(true);
    expect(out.some((m) => m.content === "侧重化学机制")).toBe(true);
    // 最近一条助手消息全量保留
    expect(out[out.length - 1].content).toContain("第39步的完整思考");
    // 旧思考被截断而非丢弃
    const truncated = out.find((m) => m.role === "assistant" && m.content.endsWith("…"));
    expect(truncated).toBeDefined();
  });

  it("summarizes tool observations without leaking evidence", () => {
    const msgs: LLMMessage[] = [{ role: "user", content: "目标" }];
    for (let i = 0; i < 40; i++) {
      msgs.push(obs("validate_citations", `检查${i}`));
      msgs.push({ role: "assistant", content: "ok" });
    }
    const out = compactAgentMessages(msgs);
    // 旧工具观察被合并成摘要块（不含证据）；最近窗口仍保留全量
    const block = out.find((m) => m.content.includes("【已执行步骤摘要】"));
    expect(block?.content).toContain("[validate_citations]");
    expect(block?.content).not.toContain("证据摘录");
    expect(out.length).toBeLessThan(msgs.length);
  });

  it("merges consecutive assistant thoughts to keep roles alternating", () => {
    const msgs: LLMMessage[] = [{ role: "user", content: "目标" }];
    for (let i = 0; i < 40; i++) {
      msgs.push(obs("search_knowledge", `第${i}次检索`));
      msgs.push({ role: "assistant", content: longThought(i) });
    }
    const out = compactAgentMessages(msgs);
    // 摘要块之前的 preserved 段不应有连续 assistant
    const summaryIdx = out.findIndex((m) => m.content.includes("【已执行步骤摘要】"));
    const before = summaryIdx === -1 ? out : out.slice(0, summaryIdx);
    for (let j = 1; j < before.length; j++) {
      expect(
        before[j].role === "assistant" && before[j - 1].role === "assistant",
      ).toBe(false);
    }
  });

  it("compacts by token budget even when message count is low", () => {
    const msgs: LLMMessage[] = [{ role: "user", content: "目标" }];
    for (let i = 0; i < 3; i++) {
      msgs.push(bigObs("read_section", `读第${i}章`, 9000));
      msgs.push({ role: "assistant", content: "ok" });
    }
    // 7 条 < 32，但 3×9000 CJK ≈ 27000 token 超预算 → 压缩
    const out = compactAgentMessages(msgs);
    expect(out).not.toBe(msgs);
    // keep 窗口内超长观察被降级为摘要+证据片段，不再有整段 9000 字证据
    expect(out.some((m) => m.content.includes("【证据摘录·截断】"))).toBe(true);
    const longest = Math.max(...out.map((m) => m.content.length));
    expect(longest).toBeLessThan(3000);
  });
});

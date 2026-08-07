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

  it("keep 窗口内最近一条 write 观察不降级（其余超长观察照旧降级）", () => {
    const draft = "引言正文".repeat(600); // 2400 CJK 字，远超 1500 token 阈值
    const writeObs = `Tool result (write_section): 已生成并写回 introduction\n【证据摘录】\ntarget=introduction | 字数≈1800\n\n${draft}`;
    const oldObs = `Tool result (read_section): 已读取 introduction\n【证据摘录】\ntarget=introduction\n\n${"旧证据内容".repeat(600)}`;
    const messages: LLMMessage[] = [
      { role: "user", content: "目标" },
      { role: "assistant", content: "思考" },
      { role: "user", content: oldObs },
      { role: "assistant", content: "再想" },
    ];
    // 11 条 < MIN_COMPACT_MESSAGES=32：塞若干超长 read 观察把总量推过 24000 token，强制触发压缩
    for (let i = 0; i < 3; i++) {
      messages.push(bigObs("read_section", `旧读${i}`, 7000));
      messages.push({ role: "assistant", content: "ok" });
    }
    messages.push({ role: "user", content: writeObs }); // 最近一条 write 观察

    const out = compactAgentMessages(messages);
    // 压缩确实发生（token 预算触发，返回新数组而非原引用）
    expect(out).not.toBe(messages);
    // write 观察保留完整 draft（agent 正在写/改的章节需见完整正文）
    const writeMsg = out.find((m) => m.content.startsWith("Tool result (write_section)"));
    // 降级后的 read 观察丢失 "Tool result" 前缀，用唯一证据子串定位
    const readMsg = out.find((m) => m.content.includes("旧证据内容"));
    expect(writeMsg?.content).toContain(draft);
    expect(writeMsg?.content).toContain("【证据摘录】");
    // 旧 read_section 观察被降级：含截断标记，不含完整旧证据
    expect(readMsg?.content).toContain("【证据摘录·截断】");
    expect(readMsg?.content).not.toContain("旧证据内容".repeat(600));
  });

  it("只有最近一条 write 观察豁免，更早的 write 观察照旧降级", () => {
    const draft = "引言正文".repeat(600); // 2400 CJK 字，远超 1500 token 阈值
    const write1 = `Tool result (write_section): 第一次写\n[write_section] 第一次写\n【证据摘录】\ntarget=results\n\n${draft}`;
    const write2 = `Tool result (write_section): 第二次写\n[write_section] 第二次写\n【证据摘录】\ntarget=introduction\n\n${"新正文".repeat(800)}`;
    const messages: LLMMessage[] = [
      { role: "user", content: "目标" },
      { role: "assistant", content: "思考" },
      { role: "user", content: write1 },
      { role: "assistant", content: "再想" },
    ];
    // 11 条 < MIN_COMPACT_MESSAGES=32：塞超长 read 观察把总量推过 24000 token，强制触发压缩
    for (let i = 0; i < 3; i++) {
      messages.push(bigObs("read_section", `旧读${i}`, 7000));
      messages.push({ role: "assistant", content: "ok" });
    }
    messages.push({ role: "user", content: write2 }); // 最近一条 write 观察

    const out = compactAgentMessages(messages);
    // 压缩确实发生（token 预算触发，返回新数组而非原引用）
    expect(out).not.toBe(messages);
    // 最新 write2 保留完整新正文（未降级）
    const write2Msg = out.find((m) => m.content.includes("第二次写"));
    expect(write2Msg?.content).toContain("新正文".repeat(800).slice(0, 500));
    // 更早的 write1 被降级：含截断标记，且 summary 行 `[write_section] 第一次写` 仍可定位
    const write1Msg = out.find(
      (m) => m.content.includes("【证据摘录·截断】") && m.content.includes("第一次写"),
    );
    expect(write1Msg).toBeTruthy();
  });
});

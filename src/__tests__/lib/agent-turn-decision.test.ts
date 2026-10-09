import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock("@/lib/ai", () => ({ callAI: mocks.callAI }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => null }));

import { snapshotToInitialState } from "@/lib/agent/session-snapshot";
import { emptyAgentSessionSnapshot } from "@/contracts/agent-session";
import {
  appendGoalDecisions,
  fallbackTurnDecision,
  formatTurnTask,
  parseTurnDecision,
  requestTurnDecision,
  stripStaleTurnMessages,
} from "@/lib/agent/core/turn-decision";

describe("turn decision", () => {
  it("parses one task card and ignores surrounding text", () => {
    const card = parseTurnDecision(`好的\n{"action":"write_section","section":"results","subsectionTitle":"3.1 物相","constraints":["基质用 Ba0.79"],"stopAfter":true}`);
    expect(card).toMatchObject({
      action: "write_section",
      section: "results",
      subsectionTitle: "3.1 物相",
      stopAfter: true,
    });
    expect(formatTurnTask(card!)).toContain("【本轮任务】");
    expect(formatTurnTask(card!)).not.toContain("Plan:");
  });

  it("falls back to the named section, not a search chain", () => {
    const card = fallbackTurnDecision({
      goal: "写结果 3.1",
      decisions: [],
      hasOutline: true,
      hasBlueprint: true,
      nextSection: "introduction",
      nextPath: "1.1 背景",
    });
    expect(card.action).toBe("write_section");
    expect(card.section).toBe("results");
  });

  it("continues on the blueprint path", () => {
    const card = fallbackTurnDecision({
      goal: "继续",
      decisions: [],
      hasOutline: true,
      hasBlueprint: true,
      nextSection: "results",
      nextPath: "3.1 物相与晶体结构",
    });
    expect(card).toMatchObject({
      action: "write_section",
      section: "results",
      subsectionTitle: "3.1 物相与晶体结构",
    });
  });

  it("asks when a menu digit did not expand", () => {
    expect(fallbackTurnDecision({
      goal: "2",
      decisions: [],
      hasOutline: true,
      hasBlueprint: true,
      nextSection: "results",
    }).action).toBe("ask_user");
  });

  it("records the host formula as a decision", () => {
    const { memory, changed } = appendGoalDecisions(null, "基质用 Ba₀.₇₉Al₁₁O₁₇，不画机理图");
    expect(changed).toBe(true);
    expect(memory?.decisions.map((item) => item.text).join("\n")).toContain("Ba₀.₇₉Al₁₁O₁₇");
    expect(memory?.decisions.map((item) => item.text).join("\n")).toContain("不画机理图");
  });

  it("strips old plans and unfinished-step tails on resume", () => {
    const snap = emptyAgentSessionSnapshot("继续");
    snap.messages = [
      { role: "assistant", content: "Plan:\n1. [running] 检索\n2. [pending] 写结果" },
      { role: "user", content: "【本轮任务】只做这一件事" },
      {
        role: "assistant",
        content: "结果已写。\n\n——\n还有未完成步骤：再写讨论。可以说「继续」。",
      },
      { role: "user", content: "继续" },
    ];
    const initial = snapshotToInitialState("继续", snap);
    const text = (initial.messages ?? []).map((message) => message.content).join("\n");
    expect(text).not.toContain("Plan:");
    expect(text).not.toContain("【本轮任务】");
    expect(text).not.toContain("还有未完成步骤");
    expect(text).toContain("结果已写。");
    expect(stripStaleTurnMessages(snap.messages)).toHaveLength(2);
  });

  it("uses the model card when JSON parses, otherwise the code fallback", async () => {
    mocks.callAI.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"action":"search_knowledge","constraints":[],"stopAfter":true}' } }],
      }),
    });
    const searched = await requestTurnDecision({
      goal: "写结果",
      decisions: [],
      hasOutline: true,
      hasBlueprint: true,
    });
    expect(searched.action).toBe("search_knowledge");
    expect(mocks.callAI.mock.calls[0]?.[0]).toMatchObject({ provider: "zhipu" });
    expect(mocks.callAI.mock.calls[0]?.[0]).not.toHaveProperty("model");

    mocks.callAI.mockResolvedValueOnce({
      json: async () => ({ choices: [{ message: { content: "不是 JSON" } }] }),
    });
    const fallback = await requestTurnDecision({
      goal: "写结果",
      decisions: [],
      hasOutline: true,
      hasBlueprint: true,
    });
    expect(fallback.action).toBe("write_section");
    expect(fallback.section).toBe("results");
  });
});

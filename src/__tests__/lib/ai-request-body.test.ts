import { describe, expect, it } from "vitest";
import { buildChatCompletionsBody } from "@/lib/ai";
import type { AIToolSchema } from "@/lib/ai";

const tool: AIToolSchema = {
  type: "function",
  function: {
    name: "inspect_project",
    description: "查看项目",
    parameters: { type: "object", properties: {} },
  },
};

describe("buildChatCompletionsBody", () => {
  it("does not send thinking when DeepSeek has no tools (Writer 单轮保持默认 thinking)", () => {
    const body = buildChatCompletionsBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "写引言" }],
      stream: true,
    });
    expect(body.thinking).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it("disables DeepSeek thinking when tools are present", () => {
    const body = buildChatCompletionsBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "写引言" },
        { role: "assistant", content: "Plan:\n1. write_section" },
      ],
      tools: [tool],
      stream: false,
    });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.tools).toEqual([tool]);
    expect(body.tool_choice).toBe("auto");
  });

  it("does not send thinking for Zhipu tool calls", () => {
    const body = buildChatCompletionsBody({
      provider: "zhipu",
      model: "glm-4-flash",
      messages: [{ role: "user", content: "规划" }],
      tools: [tool],
      stream: false,
    });
    expect(body.thinking).toBeUndefined();
  });

  it("disables thinking for DeepSeek vision calls", () => {
    const body = buildChatCompletionsBody({
      provider: "vision",
      model: "deepseek-v4-flash-vision-exp",
      messages: [{ role: "user", content: "请理解这张图片" }],
      stream: false,
    });
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("echoes non-empty reasoning_content and omits empty", () => {
    const body = buildChatCompletionsBody({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      messages: [
        { role: "assistant", content: "先看项目", reasoning_content: "需要 inspect" },
        { role: "assistant", content: "无思维链", reasoning_content: "" },
      ],
      stream: false,
    });
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]?.reasoning_content).toBe("需要 inspect");
    expect(messages[1]).not.toHaveProperty("reasoning_content");
  });
});

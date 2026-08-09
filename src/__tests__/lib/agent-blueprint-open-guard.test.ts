import { describe, expect, it } from "vitest";
import type { AgentUiMessage } from "@/contracts/agent-session";
import { findNewBlueprintOpenIndex } from "@/lib/agent/blueprint-open-guard";

describe("findNewBlueprintOpenIndex", () => {
  it("returns -1 when no new open_blueprint observation", () => {
    const messages: AgentUiMessage[] = [
      { kind: "user", text: "hi" },
      {
        kind: "observation",
        tool: "open_blueprint_workspace",
        summary: "已打开",
      },
    ];
    // 水位已在最后一条 → 无新增
    expect(findNewBlueprintOpenIndex(messages, 1)).toBe(-1);
  });

  it("finds newly appended successful open", () => {
    const messages: AgentUiMessage[] = [
      { kind: "user", text: "看看蓝图" },
      { kind: "action", tool: "open_blueprint_workspace", params: {} },
      {
        kind: "observation",
        tool: "open_blueprint_workspace",
        summary: "已打开",
      },
    ];
    expect(findNewBlueprintOpenIndex(messages, 0)).toBe(2);
  });

  it("ignores failed observation", () => {
    const messages: AgentUiMessage[] = [
      {
        kind: "observation",
        tool: "open_blueprint_workspace",
        error: "尚未生成",
      },
    ];
    expect(findNewBlueprintOpenIndex(messages, -1)).toBe(-1);
  });

  it("does not reopen historical when scanning from restored watermark", () => {
    const messages: AgentUiMessage[] = [
      {
        kind: "observation",
        tool: "open_blueprint_workspace",
        summary: "旧会话打开过",
      },
      { kind: "user", text: "继续写" },
      {
        kind: "observation",
        tool: "write_section",
        summary: "ok",
      },
    ];
    // 恢复时水位设为 length-1=2，之后无新 open → -1
    expect(findNewBlueprintOpenIndex(messages, 2)).toBe(-1);
  });
});

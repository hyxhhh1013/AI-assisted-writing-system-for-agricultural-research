import { describe, expect, it } from "vitest";
import {
  AGENT_ENTRY_MODES,
  applyEntryModeToGoal,
  getAgentEntryMode,
  type AgentEntryMode,
} from "@/lib/agent/entry-mode";

describe("AGENT_ENTRY_MODES", () => {
  it("对齐 academic-paper 三档入口，顺序固定", () => {
    expect(AGENT_ENTRY_MODES.map((m) => m.id)).toEqual([
      "full",
      "outline_ready",
      "data_ready",
    ]);
  });

  it("每档都有唯一 id、label、hint 和含入口标记的 goalPrefix", () => {
    const ids = new Set<string>();
    for (const m of AGENT_ENTRY_MODES) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
      // goalPrefix 必须携带入口标记，供 agent 简报/前缀识别
      expect(m.goalPrefix).toContain(`【写作入口=${m.id}`);
    }
  });
});

describe("getAgentEntryMode", () => {
  it("null / undefined / 空串返回 null", () => {
    expect(getAgentEntryMode(null)).toBeNull();
    expect(getAgentEntryMode(undefined)).toBeNull();
    expect(getAgentEntryMode("")).toBeNull();
  });

  it("未知 id 返回 null", () => {
    expect(getAgentEntryMode("bogus")).toBeNull();
  });

  it("合法 id 返回对应档位", () => {
    expect(getAgentEntryMode("full")?.id).toBe("full");
    expect(getAgentEntryMode("outline_ready")?.id).toBe("outline_ready");
    expect(getAgentEntryMode("data_ready")?.id).toBe("data_ready");
  });
});

describe("applyEntryModeToGoal", () => {
  it("空 / 纯空白 goal 直接返回（无前缀）", () => {
    expect(applyEntryModeToGoal("", "full")).toBe("");
    expect(applyEntryModeToGoal("   ", "full")).toBe("");
  });

  it("无入口模式时 goal 原样返回", () => {
    expect(applyEntryModeToGoal("写引言", null)).toBe("写引言");
    expect(applyEntryModeToGoal("写引言", undefined)).toBe("写引言");
  });

  it("未知入口模式时 goal 原样返回", () => {
    // 类型签名只允许合法 id，运行时传非法串需绕过类型（验证防御逻辑）
    expect(applyEntryModeToGoal("写引言", "bogus" as AgentEntryMode)).toBe("写引言");
  });

  it("合法入口模式时把 goalPrefix 拼到用户目标前", () => {
    const out = applyEntryModeToGoal("写引言", "outline_ready");
    expect(out).toContain("【写作入口=outline_ready");
    expect(out).toContain("用户：写引言");
  });

  it("goal 已带入口前缀时幂等，不重复拼接", () => {
    const once = applyEntryModeToGoal("写引言", "outline_ready");
    expect(applyEntryModeToGoal(once, "outline_ready")).toBe(once);
    // 换档位同样不重复拼，避免「入口 A｜入口 B」双层前缀
    expect(applyEntryModeToGoal(once, "full")).toBe(once);
  });

  it("保留 goal 首尾空白处理：trim 后拼接、返回即含前缀", () => {
    const out = applyEntryModeToGoal("  写引言  ", "data_ready");
    expect(out.startsWith("【写作入口=data_ready")).toBe(true);
    expect(out).toContain("用户：写引言");
  });
});

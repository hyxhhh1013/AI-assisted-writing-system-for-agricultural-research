import { describe, expect, it } from "vitest";
import {
  adminAgentStatusLabel,
  adminFeatureLabel,
  adminRoleLabel,
  adminToolLabel,
} from "@/lib/admin-labels";

describe("admin labels", () => {
  it("maps usage features", () => {
    expect(adminFeatureLabel("ai:deepseek")).toBe("DeepSeek");
    expect(adminFeatureLabel("ai:zhipu")).toBe("智谱");
    expect(adminFeatureLabel("ai:vision")).toBe("DeepSeek 视觉");
    expect(adminFeatureLabel("writing")).toBe("扩写");
  });

  it("falls back for unknown ai keys", () => {
    expect(adminFeatureLabel("ai:other")).toBe("other");
    expect(adminFeatureLabel("custom-feature")).toBe("custom-feature");
  });

  it("maps roles and agent status", () => {
    expect(adminRoleLabel("admin")).toBe("管理员");
    expect(adminRoleLabel("user")).toBe("用户");
    expect(adminAgentStatusLabel("interrupted")).toBe("已中断");
    expect(adminAgentStatusLabel("done")).toBe("完成");
  });

  it("maps common agent tools", () => {
    expect(adminToolLabel("search_external")).toBe("外部检索");
    expect(adminToolLabel("unknown_tool")).toBe("unknown_tool");
  });
});

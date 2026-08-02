import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getSetting: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting }));

import {
  loadAgentRoleProviders,
  getAgentProvider,
  AGENT_ROLE_SETTING_KEYS,
} from "@/lib/models";

describe("loadAgentRoleProviders", () => {
  beforeEach(async () => {
    // 先重置为默认，避免测试间状态污染
    mocks.getSetting.mockResolvedValue(null);
    await loadAgentRoleProviders();
    mocks.getSetting.mockReset();
  });

  it("keeps defaults when no DB settings exist", async () => {
    mocks.getSetting.mockResolvedValue(null);
    await loadAgentRoleProviders();
    expect(getAgentProvider("writer")).toBe("deepseek");
    expect(getAgentProvider("refiner")).toBe("deepseek");
  });

  it("loads configured role providers from DB", async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      if (key === AGENT_ROLE_SETTING_KEYS.writer) return "zhipu";
      if (key === AGENT_ROLE_SETTING_KEYS.verifier) return "deepseek";
      return null;
    });
    await loadAgentRoleProviders();
    expect(getAgentProvider("writer")).toBe("zhipu");
    expect(getAgentProvider("verifier")).toBe("deepseek");
  });

  it("ignores invalid provider values (keeps previous mapping)", async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      if (key === AGENT_ROLE_SETTING_KEYS.writer) return "zhipu";
      return null;
    });
    await loadAgentRoleProviders();
    // 下一次加载非法值 gpt-4，writer 应保持 zhipu
    mocks.getSetting.mockResolvedValue("gpt-4");
    await loadAgentRoleProviders();
    expect(getAgentProvider("writer")).toBe("zhipu");
    expect(getAgentProvider("verifier")).toMatch(/^(deepseek|zhipu)$/);
  });
});

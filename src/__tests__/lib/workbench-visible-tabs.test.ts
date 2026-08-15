import { describe, expect, it } from "vitest";
import {
  isWorkbenchExpertTab,
  shouldShowAllWorkbenchTabs,
  WORKBENCH_EXPERT_TAB_IDS,
} from "@/lib/workbench-visible-tabs";

describe("workbench-visible-tabs", () => {
  it("marks data/xrd/outline/writing as expert", () => {
    expect(WORKBENCH_EXPERT_TAB_IDS).toEqual(["data", "xrd", "outline", "writing"]);
    expect(isWorkbenchExpertTab("data")).toBe(true);
    expect(isWorkbenchExpertTab("agent")).toBe(false);
    expect(isWorkbenchExpertTab("structure")).toBe(false);
  });

  it("default hides expert tabs unless env forced", () => {
    const prev = process.env.NEXT_PUBLIC_WORKBENCH_EXPERT_TABS;
    delete process.env.NEXT_PUBLIC_WORKBENCH_EXPERT_TABS;
    expect(shouldShowAllWorkbenchTabs()).toBe(false);
    process.env.NEXT_PUBLIC_WORKBENCH_EXPERT_TABS = "1";
    expect(shouldShowAllWorkbenchTabs()).toBe(true);
    process.env.NEXT_PUBLIC_WORKBENCH_EXPERT_TABS = prev;
  });
});

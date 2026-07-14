import { describe, expect, it } from "vitest";
import {
  getPhaseNavigationAction,
  getPrimaryTabForPhase,
  isPhaseNavigable,
  isTabAlignedWithPhase,
} from "@/lib/paper-passport-navigation";

describe("paper-passport-navigation", () => {
  it("maps phases to primary workbench tabs", () => {
    expect(getPrimaryTabForPhase(1)).toBe("reader");
    expect(getPrimaryTabForPhase(2)).toBe("outline");
    expect(getPrimaryTabForPhase(3)).toBe("outline");
    expect(isTabAlignedWithPhase("outline", 2)).toBe(true);
    expect(isTabAlignedWithPhase("structure", 2)).toBe(false);
  });

  it("maps phases to workbench targets", () => {
    expect(getPhaseNavigationAction(0)).toEqual({ type: "open-meta" });
    expect(getPhaseNavigationAction(1)).toEqual({ type: "workbench-tab", tab: "reader" });
    expect(getPhaseNavigationAction(2)).toEqual({ type: "workbench-tab", tab: "outline" });
    expect(getPhaseNavigationAction(3)).toEqual({ type: "workbench-tab", tab: "outline" });
    expect(getPhaseNavigationAction(5)).toEqual({ type: "focus-section", sectionKey: "abstract" });
    expect(getPhaseNavigationAction(6)).toEqual({ type: "workbench-tab", tab: "plagiarism" });
    expect(getPhaseNavigationAction(7)).toEqual({ type: "open-export" });
  });

  it("blocks navigation for locked phases", () => {
    expect(isPhaseNavigable(2, "locked")).toBe(false);
    expect(isPhaseNavigable(2, "ready")).toBe(true);
    expect(isPhaseNavigable(2, "in_progress")).toBe(true);
    expect(isPhaseNavigable(2, "done")).toBe(true);
  });
});

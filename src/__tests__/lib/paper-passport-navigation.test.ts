import { describe, expect, it } from "vitest";
import {
  getPhaseNavigationAction,
  getPrimaryTabForPhase,
  isPhaseNavigable,
  isTabAlignedWithPhase,
  phasePrefersAgentTab,
} from "@/lib/paper-passport-navigation";

describe("paper-passport-navigation", () => {
  it("maps phases to primary workbench tabs", () => {
    expect(getPrimaryTabForPhase(1)).toBe("reader");
    expect(getPrimaryTabForPhase(2)).toBe("outline");
    expect(getPrimaryTabForPhase(6)).toBe("meta");
    expect(isTabAlignedWithPhase("outline", 2)).toBe(true);
    expect(isTabAlignedWithPhase("structure", 2)).toBe(false);
    expect(isTabAlignedWithPhase("structure", 6)).toBe(false);
    expect(isTabAlignedWithPhase("structure", 0)).toBe(false);
  });

  it("maps phases to workbench targets", () => {
    expect(getPhaseNavigationAction(0)).toEqual({ type: "open-meta" });
    expect(getPhaseNavigationAction(1)).toEqual({ type: "workbench-tab", tab: "reader" });
    expect(getPhaseNavigationAction(2)).toEqual({ type: "workbench-tab", tab: "outline" });
    expect(getPhaseNavigationAction(6)).toEqual({ type: "open-meta" });
    expect(getPhaseNavigationAction(7)).toEqual({ type: "workbench-tab", tab: "plagiarism" });
  });

  it("blocks navigation for locked phases", () => {
    expect(isPhaseNavigable(2, "locked")).toBe(false);
    expect(isPhaseNavigable(2, "ready")).toBe(true);
    expect(isPhaseNavigable(2, "in_progress")).toBe(true);
    expect(isPhaseNavigable(2, "done")).toBe(true);
  });

  it("marks agent-preferred phases", () => {
    expect(phasePrefersAgentTab(4)).toBe(true);
    expect(phasePrefersAgentTab(2)).toBe(false);
    expect(phasePrefersAgentTab(7)).toBe(true);
  });
});

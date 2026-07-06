import { describe, expect, it } from "vitest";
import {
  getPhaseNavigationAction,
  isPhaseNavigable,
} from "@/lib/paper-passport-navigation";

describe("paper-passport-navigation", () => {
  it("maps phases to workbench targets", () => {
    expect(getPhaseNavigationAction(0)).toEqual({ type: "open-meta" });
    expect(getPhaseNavigationAction(1)).toEqual({ type: "workbench-tab", tab: "reader" });
    expect(getPhaseNavigationAction(2)).toEqual({ type: "workbench-tab", tab: "outline" });
    expect(getPhaseNavigationAction(6)).toEqual({ type: "focus-section", sectionKey: "abstract" });
    expect(getPhaseNavigationAction(7)).toEqual({ type: "workbench-tab", tab: "plagiarism" });
  });

  it("blocks navigation for locked phases", () => {
    expect(isPhaseNavigable(2, "locked")).toBe(false);
    expect(isPhaseNavigable(2, "ready")).toBe(true);
    expect(isPhaseNavigable(2, "in_progress")).toBe(true);
    expect(isPhaseNavigable(2, "done")).toBe(true);
  });
});

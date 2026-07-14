import { describe, expect, it } from "vitest";
import { createInitialPaperPassport } from "@/contracts/paper-passport";
import { getPhaseTasks, countPendingTasks } from "@/lib/paper-passport-tasks";
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";

const emptySignals: PassportProgressSignals = {
  referenceCount: 0,
  hasBlueprint: false,
  outlineChars: 0,
  filledCoreSections: 0,
  totalCoreSections: 5,
  expandedOutlineCount: 0,
  abstractChars: 0,
  reviewDoneCount: 0,
};

describe("paper-passport-tasks", () => {
  it("lists P0 config tasks with pending items when journal empty", () => {
    const passport = createInitialPaperPassport({
      paperTitle: "测试",
      paperType: "review",
      targetJournal: "",
      wordCount: "8000-12000",
      language: "zh",
      citationStyle: "gbt7714",
    });
    const tasks = getPhaseTasks(0, passport, emptySignals);
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    expect(countPendingTasks(tasks)).toBeGreaterThan(0);
  });

  it("marks P1 ref task done when references exist", () => {
    const passport = createInitialPaperPassport({
      paperTitle: "测试",
      paperType: "review",
      targetJournal: "期刊",
      wordCount: "8000-12000",
      language: "zh",
      citationStyle: "gbt7714",
    });
    const tasks = getPhaseTasks(1, passport, { ...emptySignals, referenceCount: 2 });
    expect(tasks.find((t) => t.id === "ref-import")?.status).toBe("done");
  });
});

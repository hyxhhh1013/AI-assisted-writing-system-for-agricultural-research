import { describe, expect, it } from "vitest";
import { FIGURE_REVISE_SHORTCUTS } from "@/contracts/figure-revise";
import {
  buildFigureReviseGoal,
  formatFigurePlacementHint,
} from "@/lib/agent/figure-revise";

describe("figure-revise", () => {
  it("formatFigurePlacementHint for appended section", () => {
    expect(
      formatFigurePlacementHint({
        sectionKey: "literature_body",
        sectionLabel: "研究进展",
        insertMode: "appended",
      }),
    ).toMatch(/已追加到节末.*研究进展/);
  });

  it("buildFigureReviseGoal requires replaceImageUrl", () => {
    const goal = buildFigureReviseGoal(
      {
        imageUrl: "/api/charts/a.png",
        replaceImageUrl: "/api/charts/a.png",
        title: "图5",
        sectionKey: "literature_body",
      },
      {
        aspects: ["fork", "nodes"],
        templateId: "",
        colorPreset: "",
        note: "酸位金属位分叉",
      },
    );
    expect(goal).toMatch(/replaceImageUrl="\/api\/charts\/a\.png"/);
    expect(goal).toMatch(/增加\/调整分叉/);
    expect(goal).toMatch(/layout=fork/);
    expect(goal).toMatch(/酸位金属位分叉/);
    expect(goal).toMatch(/sectionKey 保持为 literature_body/);
  });

  it("shortcuts include fork / panel / deoxygenation presets", () => {
    const ids = FIGURE_REVISE_SHORTCUTS.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(["fork_merge", "tri_panel", "deox_template"]),
    );
    const deox = FIGURE_REVISE_SHORTCUTS.find((s) => s.id === "deox_template");
    expect(deox?.templateId).toBe("deoxygenation_paths");
    expect(deox?.aspects).toContain("template");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentBlueprintReview } from "@/components/shared/agent/agent-blueprint-review";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";

afterEach(cleanup);

const sample: WritingBlueprint = {
  version: 1,
  narrativeSummary: "从背景到进展再到展望。",
  thesis: "生物炭可提升盐碱地作物产量。",
  estimatedWordCount: { min: 8000, max: 10000 },
  figurePlan: {
    totalMin: 1,
    totalMax: 2,
    items: [
      {
        id: "fig-1",
        sectionPath: "引言",
        type: "schematic",
        purpose: "机理示意",
        suggestedCaption: "图1",
        priority: "required",
      },
    ],
  },
  sectionGuides: [
    {
      sectionPath: "引言",
      purpose: "提出问题",
      claim: "盐碱地需要改良。",
      keyPoints: ["现状", "机遇"],
    },
  ],
  writingOrder: ["引言"],
  prerequisites: [],
  generatedAt: 1,
};

describe("AgentBlueprintReview", () => {
  it("shows structured blueprint in the review page", () => {
    render(
      <AgentBlueprintReview
        projectBlueprintJson={JSON.stringify(sample)}
        open
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "批准这份蓝图，继续" })).toBeTruthy();
    expect(screen.getByText("生物炭可提升盐碱地作物产量。")).toBeTruthy();
    expect(screen.getByText(/盐碱地需要改良/)).toBeTruthy();
  });

  it("lets the user leave a revise note", () => {
    const onRevise = vi.fn();
    render(
      <AgentBlueprintReview
        projectBlueprintJson={JSON.stringify(sample)}
        open
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={onRevise}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "我来改蓝图" }));
    fireEvent.click(screen.getByRole("button", { name: "配图再少一点" }));
    fireEvent.click(screen.getByRole("button", { name: "提交修改意见" }));
    expect(onRevise).toHaveBeenCalledWith(expect.stringContaining("配图"));
  });
});

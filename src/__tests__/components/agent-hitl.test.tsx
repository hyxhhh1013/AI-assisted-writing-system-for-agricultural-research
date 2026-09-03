// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentClarifyCard } from "@/components/shared/agent/agent-clarify-card";
import { AgentToolConfirm } from "@/components/shared/agent/agent-tool-confirm";

afterEach(cleanup);

describe("AgentClarifyCard", () => {
  it("puts the question in a readable card and submits the answer", () => {
    const onSubmit = vi.fn();
    render(
      <AgentClarifyCard
        question="先写引言还是先检索文献？"
        onSubmit={onSubmit}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("先写引言还是先检索文献？")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("直接写你的决定或补充…"), {
      target: { value: "先写引言" },
    });
    fireEvent.click(screen.getByRole("button", { name: "回答后继续" }));
    expect(onSubmit).toHaveBeenCalledWith("先写引言");
  });
});

describe("AgentToolConfirm", () => {
  it("auto-opens a review page for import candidates", () => {
    render(
      <AgentToolConfirm
        tool="import_reference"
        message="确认批量导入 1 篇文献？"
        open
        onOpenChange={vi.fn()}
        importItems={[
          {
            id: "doi:10.1/x",
            title: "Catalytic pyrolysis review",
            authors: ["Zhang"],
            year: 2024,
            journal: "JAAP",
            doi: "10.1/x",
            abstract: "This paper reviews biomass catalytic pyrolysis.",
            source: "openalex",
          },
        ]}
        importSelected={new Set([0])}
        onToggleImport={vi.fn()}
        onSetAllImport={vi.fn()}
        importSelectedCount={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Catalytic pyrolysis review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认导入 1 篇" })).toBeTruthy();
  });

  it("marks destructive deletes as a danger HITL", () => {
    render(
      <AgentToolConfirm
        tool="remove_figure"
        message={"确认删除图表「chart-1」？"}
        preview="chart-1"
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("需要你拍板 · 破坏性操作")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认删除" })).toBeTruthy();
    expect(screen.getByText("chart-1")).toBeTruthy();
  });
});

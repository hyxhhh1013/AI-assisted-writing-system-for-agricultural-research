// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentClarifyCard, formatChoicePrompt } from "@/components/shared/agent/agent-clarify-card";
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

  it("renders numbered options as a list without raw markdown asterisks", () => {
    render(
      <AgentClarifyCard
        question="**下一步请选**: 1. **继续写子节**； 2. **先写结论**。 回复 1/2/3 即可。"
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.getByText("下一步请选:")).toBeTruthy();
    expect(screen.getByText("继续写子节")).toBeTruthy();
    expect(screen.getByText(/先写结论/)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
    expect(formatChoicePrompt("1. 甲； 2. 乙。 回复 1/2/3")).toContain("\n2. 乙");
  });

  it("keeps the answer box when the question includes a long 执行摘要 dump", () => {
    const dump = " [write_section] 已写回 ".repeat(40);
    render(
      <AgentClarifyCard
        question={`**下一步请选**： 1. **继续写子节**； 2.**先写结论**。 回复 1 / 2 即可。执行摘要:${dump}`}
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/write_section/)).toBeNull();
    expect(screen.getByPlaceholderText("直接写你的决定或补充…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "回答后继续" })).toBeTruthy();
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
            why: "标题/摘要命中：pyrolysis",
            topicFit: "aligned",
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
    expect(screen.getByText("对口")).toBeTruthy();
    expect(screen.getByText("标题/摘要命中：pyrolysis")).toBeTruthy();
    expect(screen.getByText("This paper reviews biomass catalytic pyrolysis.")).toBeTruthy();
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

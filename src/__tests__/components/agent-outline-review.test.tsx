// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentOutlineReview } from "@/components/shared/agent/agent-outline-review";

afterEach(cleanup);

const SAMPLE = `# 生物质热解技术研究进展综述——文献综述大纲
## 摘要
木质纤维素热解具有战略价值。
## 引言
交代背景与问题。
`;

describe("AgentOutlineReview", () => {
  it("shows HITL compact card and full outline in the review page", () => {
    render(
      <AgentOutlineReview
        preview={SAMPLE}
        open
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "批准这份大纲，继续" })).toBeTruthy();
    expect(screen.getAllByText("摘要").length).toBeGreaterThan(0);
    expect(screen.getByText(/木质纤维素热解/)).toBeTruthy();
  });

  it("shows imported reference numbers beside a matching heading", () => {
    render(
      <AgentOutlineReview
        preview={"## 生物炭土壤效应\n要点\n## 引言\n背景"}
        references={["[1] 张三. 生物炭提高土壤碳. 2024.", "[2] 李四. 聚合物催化. 2020."]}
        open
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/\[1\]/).length).toBeGreaterThan(0);
    expect(screen.getByText("已导入文献里还对不上这一节")).toBeTruthy();
  });

  it("keeps a sidebar entry when the review page is closed", () => {
    render(
      <AgentOutlineReview
        preview={SAMPLE}
        open={false}
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getByText("需要你拍板 · 写作已暂停")).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开过目页" })).toBeTruthy();
  });

  it("lets the user leave a structure note", () => {
    const onRevise = vi.fn();
    render(
      <AgentOutlineReview
        preview={SAMPLE}
        open
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onRevise={onRevise}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "让 Agent 改" }));
    fireEvent.click(screen.getByRole("button", { name: "补方法/数据节" }));
    fireEvent.click(screen.getByRole("button", { name: "提交修改意见" }));
    expect(onRevise).toHaveBeenCalledWith(expect.stringContaining("方法"));
  });

  it("saves markdown edits without going through Agent chat", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onApprove = vi.fn();
    render(
      <AgentOutlineReview
        preview={SAMPLE}
        open
        onOpenChange={vi.fn()}
        onApprove={onApprove}
        onRevise={vi.fn()}
        onSaveOutline={onSave}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "直接编辑" })[0]);
    const editor = screen.getByLabelText("大纲 Markdown");
    fireEvent.change(editor, { target: { value: "## 摘要\n缩短。\n## 引言\n重写背景。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并批准" }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("## 摘要\n缩短。\n## 引言\n重写背景。");
      expect(onApprove).toHaveBeenCalled();
    });
  });
});

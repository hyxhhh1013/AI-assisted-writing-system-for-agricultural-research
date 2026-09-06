// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KnowledgeReindexMenu } from "@/components/shared/knowledge/knowledge-reindex-menu";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

afterEach(cleanup);

describe("KnowledgeReindexMenu", () => {
  it("页头主按钮跑增量更新，不带 force 标志", () => {
    const onRun = vi.fn();
    render(<KnowledgeReindexMenu onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "更新索引" }));
    expect(onRun).toHaveBeenCalledWith({}, "正在增量更新索引（跳过未改动的文献）…");
  });

  it("下拉强制重解析会先确认再提交", async () => {
    const onRun = vi.fn();
    render(<KnowledgeReindexMenu onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "更多索引任务" }));
    const forceItem = await screen.findByText("强制重解析 PDF");
    fireEvent.click(forceItem);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByText("强制重解析全部 PDF？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "强制重解析全部 PDF" }));
    expect(onRun).toHaveBeenCalledWith(
      { forceStage1: true },
      "正在强制重解析 PDF…",
    );
  });

  it("已选工具栏把文件名传进增量任务", () => {
    const onRun = vi.fn();
    render(
      <KnowledgeReindexMenu
        variant="batch"
        files={["a.pdf", "b.pdf"]}
        onRun={onRun}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /索引所选/ }));
    fireEvent.click(screen.getByText("更新索引"));
    expect(onRun).toHaveBeenCalledWith(
      { files: ["a.pdf", "b.pdf"] },
      "正在更新索引（2 篇）…",
    );
  });
});

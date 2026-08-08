// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WritingStatusCard } from "@/components/shared/agent/writing-status-card";
import type { WriteStatus } from "@/lib/agent/write-status";

afterEach(cleanup);

const base = (over: Partial<WriteStatus> = {}): WriteStatus => ({
  section: "引言",
  stage: "writing",
  chars: 1200,
  elapsedMs: 45_000,
  info: [],
  warnings: [],
  ...over,
});

describe("WritingStatusCard", () => {
  it("阶段 stepper：当前阶段高亮 + 统计", () => {
    render(<WritingStatusCard status={base()} />);
    expect(screen.getByText("生成初稿…")).toBeTruthy();
    expect(screen.getByText(/已 1200 字/)).toBeTruthy();
  });

  it("生成初稿且 0 字时显示等待 AI 提示（而非误导的「已 0 字」）", () => {
    render(<WritingStatusCard status={base({ chars: 0 })} />);
    expect(screen.getByText(/等待 AI 输出首段/)).toBeTruthy();
    expect(screen.queryByText(/已 0 字/)).toBeNull();
  });

  it("非 writing 阶段且 0 字时不显示误导性字数", () => {
    render(<WritingStatusCard status={base({ stage: "retrieving", chars: 0 })} />);
    expect(screen.queryByText(/已 0 字/)).toBeNull();
    expect(screen.queryByText(/等待 AI/)).toBeNull();
  });

  it("info 提示条渲染", () => {
    render(<WritingStatusCard status={base({ info: ["已扩大全库检索"] })} />);
    expect(screen.getByText("已扩大全库检索")).toBeTruthy();
  });

  it("完成态收成摘要行", () => {
    render(<WritingStatusCard status={base({ stage: "completed", done: { chars: 1450, issueCount: 0, passed: true } })} />);
    expect(screen.getByText(/已写回 引言 · 1450 字/)).toBeTruthy();
  });

  it("错误态：红框 + 重试按钮回调", () => {
    const onRetry = vi.fn();
    render(<WritingStatusCard status={base({ stage: "error", error: "AI 调用失败" })} onRetry={onRetry} />);
    expect(screen.getByText(/AI 调用失败/)).toBeTruthy();
    screen.getByRole("button", { name: /重试/ }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("fast 模式裁剪：只显示出现过的阶段", () => {
    const { container, rerender } = render(<WritingStatusCard status={base({ stage: "writing" })} />);
    rerender(<WritingStatusCard status={base({ stage: "completed", detail: "完成", done: { chars: 1450, issueCount: 0, passed: true } })} />);
    expect(container.textContent).toContain("初稿");
    expect(container.textContent).toContain("完成");
    expect(container.textContent).not.toContain("核查");
    expect(container.textContent).not.toContain("检索");
    expect(container.textContent).not.toContain("修正");
  });

  it("warnings 提示条渲染", () => {
    render(<WritingStatusCard status={base({ warnings: ["数据声明未核实：abc"] })} />);
    expect(screen.getByText("数据声明未核实：abc")).toBeTruthy();
  });

  it("完成态展开核查报告（verification）", () => {
    render(<WritingStatusCard status={base({ stage: "completed", done: { chars: 100, issueCount: 0, passed: true, verification: "细节报告" } })} />);
    fireEvent.click(screen.getByText(/已写回 引言/));
    expect(screen.getByText("细节报告")).toBeTruthy();
  });

  it("无 onRetry 时错误态不渲染重试按钮", () => {
    render(<WritingStatusCard status={base({ stage: "error", error: "失败" })} />);
    expect(screen.queryByRole("button", { name: /重试/ })).toBeNull();
  });
});

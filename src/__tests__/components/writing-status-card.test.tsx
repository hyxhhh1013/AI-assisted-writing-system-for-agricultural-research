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
  it("进行中：章节 + 阶段文案 + 字数", () => {
    render(<WritingStatusCard status={base()} />);
    expect(screen.getByText(/撰写「引言」/)).toBeTruthy();
    expect(screen.getByText(/正在生成正文/)).toBeTruthy();
    expect(screen.getByText(/1,200 字/)).toBeTruthy();
  });

  it("生成初稿且 0 字时显示等待首段（而非「已 0 字」）", () => {
    render(<WritingStatusCard status={base({ chars: 0 })} />);
    expect(screen.getByText(/等待首段输出/)).toBeTruthy();
    expect(screen.queryByText(/0 字/)).toBeNull();
  });

  it("非 writing 阶段且 0 字时不显示误导性字数", () => {
    render(<WritingStatusCard status={base({ stage: "retrieving", chars: 0 })} />);
    expect(screen.queryByText(/等待首段/)).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("完成态：单行摘要，无空洞「完成」详情堆叠", () => {
    render(
      <WritingStatusCard
        status={base({
          stage: "completed",
          detail: "完成",
          done: { chars: 1450, issueCount: 0, passed: true },
          info: ["已过滤跑题片段"],
        })}
      />,
    );
    expect(screen.getByText(/「引言」已写回/)).toBeTruthy();
    expect(screen.getByText(/1,450 字/)).toBeTruthy();
    expect(screen.getByText("已过滤跑题片段")).toBeTruthy();
    // 不再渲染厚重 stepper 药丸「完成」
    expect(screen.queryByText("点击展开详情")).toBeNull();
  });

  it("完成态修正说明", () => {
    render(
      <WritingStatusCard
        status={base({
          stage: "completed",
          done: { chars: 2864, issueCount: 8, passed: false },
        })}
      />,
    );
    expect(screen.getByText(/按 8 条意见修正/)).toBeTruthy();
  });

  it("错误态：红框 + 重试按钮回调", () => {
    const onRetry = vi.fn();
    render(<WritingStatusCard status={base({ stage: "error", error: "AI 调用失败" })} onRetry={onRetry} />);
    expect(screen.getByText(/AI 调用失败/)).toBeTruthy();
    screen.getByRole("button", { name: /重试/ }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("fast 模式裁剪：只显示出现过的阶段轨", () => {
    const { container, rerender } = render(<WritingStatusCard status={base({ stage: "writing" })} />);
    expect(container.textContent).toContain("初稿");
    rerender(
      <WritingStatusCard
        status={base({
          stage: "completed",
          detail: "完成",
          done: { chars: 1450, issueCount: 0, passed: true },
        })}
      />,
    );
    // 完成态不再展示阶段轨
    expect(container.textContent).not.toContain("核查");
    expect(container.textContent).toContain("已写回");
  });

  it("warnings 提示条渲染", () => {
    render(<WritingStatusCard status={base({ warnings: ["数据声明未核实：abc"] })} />);
    expect(screen.getByText("数据声明未核实：abc")).toBeTruthy();
  });

  it("完成态展开核查报告（verification）", () => {
    render(
      <WritingStatusCard
        status={base({
          stage: "completed",
          done: { chars: 100, issueCount: 0, passed: true, verification: "细节报告" },
        })}
      />,
    );
    fireEvent.click(screen.getByText(/「引言」已写回/));
    expect(screen.getByText("细节报告")).toBeTruthy();
  });

  it("无 onRetry 时错误态不渲染重试按钮", () => {
    render(<WritingStatusCard status={base({ stage: "error", error: "失败" })} />);
    expect(screen.queryByRole("button", { name: /重试/ })).toBeNull();
  });
});

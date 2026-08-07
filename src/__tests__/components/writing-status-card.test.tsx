// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WritingStatusCard } from "@/components/shared/agent/writing-status-card";
import type { WriteStatus } from "@/lib/agent/write-status";

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

  it("fast 模式裁剪：未出现过的阶段不渲染", () => {
    // 只经过 writing→completed，visited 不含 retrieving/verifying/refining
    const { container } = render(<WritingStatusCard status={base({ stage: "completed", detail: "完成", done: { chars: 1450, issueCount: 0, passed: true } })} />);
    expect(container.textContent).not.toContain("核查");
    expect(container.textContent).not.toContain("检索");
    expect(container.textContent).not.toContain("修正");
  });
});

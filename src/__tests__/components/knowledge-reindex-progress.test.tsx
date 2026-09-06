// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KnowledgeReindexProgress } from "@/components/shared/knowledge/knowledge-reindex-progress";
import {
  applyReindexEvent,
  INITIAL_REINDEX_PROGRESS,
  type ReindexProgressState,
} from "@/contracts/reindex";

afterEach(cleanup);

function progressAfterWrites(): ReindexProgressState {
  let state = applyReindexEvent(INITIAL_REINDEX_PROGRESS, { type: "started" });
  state = applyReindexEvent(state, { type: "phase", phase: "writing", detail: "写入中" });
  return state;
}

describe("KnowledgeReindexProgress", () => {
  it("shows three pipeline stages without collapsing to a single bar", () => {
    render(
      <KnowledgeReindexProgress
        isIndexing
        panelOpen
        indexProgress={progressAfterWrites()}
        onCancel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("解析 PDF")).toBeTruthy();
    expect(screen.getByText("写入索引")).toBeTruthy();
    expect(screen.getByText("向量化")).toBeTruthy();
    expect(screen.getByText("写入索引文件")).toBeTruthy();
  });

  it("keeps the panel after complete so the result does not vanish", () => {
    const done = applyReindexEvent(progressAfterWrites(), {
      type: "complete",
      totalChunks: 4,
      fileCount: 1,
      categoryCount: 1,
    });
    render(
      <KnowledgeReindexProgress
        isIndexing={false}
        panelOpen
        indexProgress={done}
        onCancel={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("索引构建完成")).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭" })).toBeTruthy();
  });
});

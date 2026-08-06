import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/writing/run-pipeline", () => ({
  runWritingPipeline: vi.fn(async ({ emit }: { emit: (e: Record<string, unknown>) => void }) => {
    emit({ type: "status", status: "writing" });
    emit({ type: "delta", content: "x".repeat(10) });
    emit({ type: "pipeline_step", step: "writing", status: "done", detail: "初稿 10 字" });
  }),
}));

import type { WritingInput } from "@/lib/validations";
import { runWritingPipeline } from "@/app/api/writing/run-pipeline";
import { runAgentWriteSection } from "@/lib/agent/writing-runner";

const testData = {
  title: "t",
  section: "introduction",
  context: "c",
  language: "zh",
  template: "sci",
  existingReferences: [],
  referenceEvidence: [],
  globalContext: {},
  mode: "full",
  retrievalMode: "balanced",
  researchDirection: "d",
  projectMode: "research",
  citationStyle: "gbt7714",
  dataClaims: [],
} satisfies WritingInput;

describe("runAgentWriteSection 进度转发", () => {
  it("把管道 emit 的事件实时转发给 onWritingEvent", async () => {
    const received: unknown[] = [];
    await runAgentWriteSection({
      data: testData,
      context: "c",
      dataClaims: [],
      userId: "u1",
      signal: new AbortController().signal,
      onWritingEvent: (e) => received.push(e),
    });

    expect(vi.mocked(runWritingPipeline)).toHaveBeenCalled();
    expect(received.map((e) => (e as { type: string }).type)).toEqual([
      "status",
      "delta",
      "pipeline_step",
    ]);
  });

  it("onWritingEvent 缺省时正常收集结果", async () => {
    const result = await runAgentWriteSection({
      data: testData,
      context: "c",
      dataClaims: [],
      userId: "u1",
      signal: new AbortController().signal,
    });
    expect(result.pipelineMode).toBe("full");
    expect(result.draft).toBe("x".repeat(10));
  });

  it("错误事件同时转发给 onWritingEvent 并抛出", async () => {
    vi.mocked(runWritingPipeline).mockImplementationOnce(async ({ emit }) => {
      emit({ type: "error", error: "boom" });
    });
    const received: unknown[] = [];
    await expect(
      runAgentWriteSection({
        data: testData,
        context: "c",
        dataClaims: [],
        userId: "u1",
        signal: new AbortController().signal,
        onWritingEvent: (e) => received.push(e),
      }),
    ).rejects.toThrow("boom");
    expect(received.map((e) => (e as { type: string }).type)).toEqual(["error"]);
  });
});

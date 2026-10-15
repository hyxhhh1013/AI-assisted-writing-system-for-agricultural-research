import { describe, expect, it } from "vitest";
import { viewOpsSession } from "@/lib/ops-session-view";

describe("viewOpsSession", () => {
  it("keeps the tail of the transcript and drops section text", () => {
    const transcript = Array.from({ length: 20 }, (_, index) => ({
      kind: "user" as const,
      text: `第 ${index} 句`,
    }));
    transcript.push({
      kind: "action" as const,
      tool: "write_section",
      params: { section: "results", content: "这是一段不该出现在运维响应里的正文".repeat(20) },
    } as unknown as { kind: "user"; text: string });

    const view = viewOpsSession({
      id: "cmuntp1ls0001",
      projectId: "p1",
      projectTitle: "茶多酚",
      directionSlug: null,
      goal: "写结果",
      status: "completed",
      errorMessage: null,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T01:00:00.000Z",
      snapshot: {
        version: 1,
        messages: [{ role: "user", content: "整段对话不外发" }],
        plan: null,
        iteration: 3,
        toolCallCount: 4,
        toolSummaries: [],
        observations: [],
        pendingToolCalls: [],
        finished: true,
        error: null,
        intentKind: "draft",
        uiTranscript: [
          ...transcript,
          { kind: "thought", text: "内部想法" },
        ],
        toolTrace: [{ at: 1, tool: "write_section", ok: true }],
      },
    });

    expect(view.transcriptDropped).toBeGreaterThan(0);
    expect(view.transcript.length).toBeLessThanOrEqual(12);
    expect(view.transcript.some((line) => line.kind === "thought")).toBe(false);
    const action = view.transcript.find((line) => line.tool === "write_section");
    expect(action?.params?.content).toMatch(/chars$/);
    expect(JSON.stringify(view)).not.toContain("不该出现在运维响应里的正文");
    expect(JSON.stringify(view)).not.toContain("整段对话不外发");
    expect(view.intentKind).toBe("draft");
  });
});

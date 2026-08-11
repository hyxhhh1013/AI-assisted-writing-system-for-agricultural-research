import { describe, expect, it } from "vitest";
import {
  applyCheckpointDecisionPatch,
  resolveCheckpointKind,
} from "@/lib/agent/core/checkpoints";

describe("applyCheckpointDecisionPatch", () => {
  it("revise 清空 pendingToolCalls，避免短路重跑旧写工具", () => {
    const out = applyCheckpointDecisionPatch(
      {
        approvedCheckpointKinds: [],
        messages: [{ role: "user", content: "写整篇" }],
        pendingToolCalls: [
          { id: "1", name: "write_section", args: { section: "introduction" } },
        ],
      },
      {
        checkpointId: "cp_outline_1",
        decision: "revise",
        note: "请把方法节拆细",
      },
    );
    expect(out.pendingToolCalls).toEqual([]);
    expect(out.messages?.at(-1)?.content).toMatch(/需修改|修改大纲/);
    expect(out.approvedCheckpointKinds).toEqual([]);
  });

  it("approve 保留 pending，记入 approvedKinds", () => {
    const pending = [
      { id: "1", name: "write_section", args: { section: "introduction" } },
    ];
    const out = applyCheckpointDecisionPatch(
      {
        approvedCheckpointKinds: [],
        messages: [],
        pendingToolCalls: pending,
      },
      { checkpointId: "cp_outline_1", decision: "approve" },
    );
    expect(out.pendingToolCalls).toBeUndefined();
    expect(out.approvedCheckpointKinds).toEqual(["outline_approve"]);
  });

  it("resolveCheckpointKind 识别 blueprint / clarify", () => {
    expect(
      resolveCheckpointKind({ checkpointId: "cp_blueprint_9", decision: "approve" }),
    ).toBe("blueprint_approve");
    expect(
      resolveCheckpointKind({ checkpointId: "cp_clarify_1", decision: "approve" }),
    ).toBe("clarify");
  });
});

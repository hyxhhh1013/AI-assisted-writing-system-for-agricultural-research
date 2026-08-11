import { describe, expect, it } from "vitest";
import type { AgentActiveWrite } from "@/contracts/agent-session";
import {
  MIN_PARTIAL_CHARS,
  applyWritingEventToDraftAcc,
  buildPartialWriteRefineCall,
  buildWriteAttemptKey,
  clipActiveWriteDraft,
  ensurePendingWriteFromActive,
  evaluateWriteResume,
  isPartialWriteResume,
} from "@/lib/agent/write-resume";

function active(partial: Partial<AgentActiveWrite> & Pick<AgentActiveWrite, "status" | "draftText">): AgentActiveWrite {
  const params = {
    section: "introduction",
    context: "写研究背景",
    pipelineMode: "fast",
  };
  return {
    tool: "write_section",
    attemptKey: buildWriteAttemptKey(params),
    section: "introduction",
    params,
    startedAt: 1,
    updatedAt: 2,
    draftChars: (partial.draftText ?? "").length,
    pipelineMode: "fast",
    ...partial,
  };
}

describe("buildWriteAttemptKey", () => {
  it("same params → same key；改 context → 不同 key", () => {
    const a = buildWriteAttemptKey({ section: "introduction", context: "A" });
    const b = buildWriteAttemptKey({ section: "introduction", context: "A" });
    const c = buildWriteAttemptKey({ section: "introduction", context: "B" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("evaluateWriteResume", () => {
  const params = {
    section: "introduction",
    context: "写研究背景",
    pipelineMode: "fast",
  };

  it("无 activeWrite → run", () => {
    expect(evaluateWriteResume(null, params).action).toBe("run");
  });

  it("attemptKey 不匹配 → run", () => {
    const aw = active({
      status: "aborted",
      draftText: "x".repeat(MIN_PARTIAL_CHARS),
      attemptKey: "deadbeef",
    });
    expect(evaluateWriteResume(aw, params).action).toBe("run");
  });

  it("completed 且草稿够长 → reuse completed", () => {
    const draft = "完整正文".repeat(30);
    const decision = evaluateWriteResume(
      active({ status: "completed", draftText: draft, completedSummary: "已完成" }),
      params,
    );
    expect(decision.action).toBe("reuse");
    if (decision.action === "reuse") {
      expect(decision.resumedFrom).toBe("completed");
      expect(decision.draft).toBe(draft);
    }
  });

  it("aborted 且草稿 ≥ MIN_PARTIAL → reuse partial", () => {
    const draft = "部".repeat(MIN_PARTIAL_CHARS);
    const decision = evaluateWriteResume(
      active({ status: "aborted", draftText: draft }),
      params,
    );
    expect(decision.action).toBe("reuse");
    if (decision.action === "reuse") {
      expect(decision.resumedFrom).toBe("partial");
      expect(decision.summary).toMatch(/断点续写/);
      expect(decision.summary).toMatch(/refine_content/);
    }
  });

  it("isPartialWriteResume / buildPartialWriteRefineCall", () => {
    expect(isPartialWriteResume({ resumedFrom: "partial", section: "methods" })).toBe(true);
    expect(isPartialWriteResume({ resumedFrom: "completed" })).toBe(false);
    const call = buildPartialWriteRefineCall("methods");
    expect(call.name).toBe("refine_content");
    expect(call.args.section).toBe("methods");
    expect(String(call.args.feedback)).toMatch(/断点续写/);
  });

  it("aborted 但草稿太短 → run", () => {
    const decision = evaluateWriteResume(
      active({ status: "aborted", draftText: "太短了" }),
      params,
    );
    expect(decision.action).toBe("run");
  });
});

describe("ensurePendingWriteFromActive", () => {
  it("中断且 pending 空 → 补回 write_section", () => {
    const aw = active({
      status: "aborted",
      draftText: "x".repeat(MIN_PARTIAL_CHARS),
    });
    const pending = ensurePendingWriteFromActive([], aw);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.name).toBe("write_section");
    expect(pending[0]!.args.section).toBe("introduction");
  });

  it("pending 已有同节 write_section → 不重复", () => {
    const aw = active({
      status: "running",
      draftText: "x".repeat(MIN_PARTIAL_CHARS),
    });
    const pending = ensurePendingWriteFromActive(
      [{ id: "1", name: "write_section", args: { section: "introduction", context: "写研究背景" } }],
      aw,
    );
    expect(pending).toHaveLength(1);
  });

  it("completed → 不补 pending", () => {
    const aw = active({ status: "completed", draftText: "ok".repeat(50) });
    expect(ensurePendingWriteFromActive([], aw)).toEqual([]);
  });
});

describe("applyWritingEventToDraftAcc / clip", () => {
  it("累计 delta 与 corrected_text", () => {
    const acc = { draft: "", references: [] as string[] };
    applyWritingEventToDraftAcc(acc, { type: "delta", content: "你好" });
    applyWritingEventToDraftAcc(acc, { type: "delta", content: "世界" });
    expect(acc.draft).toBe("你好世界");
    applyWritingEventToDraftAcc(acc, { type: "corrected_text", text: "终稿" });
    expect(acc.draft).toBe("终稿");
    applyWritingEventToDraftAcc(acc, { type: "references", references: ["[1] a"] });
    expect(acc.references).toEqual(["[1] a"]);
  });

  it("clipActiveWriteDraft 截断超长草稿", () => {
    const long = "a".repeat(90_000);
    expect(clipActiveWriteDraft(long).length).toBeLessThanOrEqual(80_000);
  });
});

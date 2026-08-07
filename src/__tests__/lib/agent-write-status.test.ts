import { describe, expect, it } from "vitest";
import {
  initWriteStatus,
  mergeProgressIntoWriteStatus,
  finalizeWriteStatus,
} from "@/lib/agent/write-status";

describe("write-status 纯逻辑", () => {
  it("init 生成空状态（stage=null，等待首个事件）", () => {
    expect(initWriteStatus("引言")).toEqual({
      section: "引言",
      stage: null,
      chars: 0,
      elapsedMs: 0,
      info: [],
      warnings: [],
    });
  });

  it("merge 覆盖 stage/detail/chars，累积 info/warnings 并去重", () => {
    let s = initWriteStatus("引言");
    s = mergeProgressIntoWriteStatus(s, { label: "x", stage: "retrieving", detail: "检索文献中…", chars: 0, elapsedMs: 100 });
    s = mergeProgressIntoWriteStatus(s, { label: "x", stage: "writing", detail: "生成初稿… 已 3 字", chars: 3, elapsedMs: 400 });
    s = mergeProgressIntoWriteStatus(s, { label: "x", info: ["已扩大全库检索"] });
    s = mergeProgressIntoWriteStatus(s, { label: "x", info: ["已扩大全库检索"] });
    s = mergeProgressIntoWriteStatus(s, { label: "x", warnings: ["数据声明未核实：abc"] });
    s = mergeProgressIntoWriteStatus(s, { label: "x", warnings: ["数据声明未核实：abc"] });
    expect(s.warnings).toHaveLength(1);
    expect(s).toMatchObject({ stage: "writing", chars: 3, info: ["已扩大全库检索"] });
    expect(s.info).toHaveLength(1);
  });

  it("finalize 成功 → completed + done 摘要（full 无问题=通过）", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), {
      success: true,
      charCount: 1450,
      issueCount: 0,
      pipelineMode: "full",
      verification: "核查通过",
    });
    expect(s.stage).toBe("completed");
    expect(s.done).toEqual({ chars: 1450, issueCount: 0, passed: true, verification: "核查通过" });
  });

  it("finalize 成功但 full 有修正意见 → passed=false", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), {
      success: true,
      charCount: 1450,
      issueCount: 3,
      pipelineMode: "full",
    });
    expect(s.stage).toBe("completed");
    expect(s.done).toEqual({ chars: 1450, issueCount: 3, passed: false });
  });

  it("finalize 失败且无 error 传参 → 默认文案", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), { success: false });
    expect(s.error).toBe("写章节失败");
  });

  it("finalize 失败 → stage=error + error 信息", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), { success: false, error: "AI 调用失败" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("AI 调用失败");
  });

  it("merge 不覆盖终态（completed 后 stray progress 不回滚）", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), { success: true, charCount: 100, issueCount: 0, pipelineMode: "full" });
    const r = mergeProgressIntoWriteStatus(s, { label: "x", stage: "writing", detail: "生成初稿…" });
    expect(r.stage).toBe("completed");
  });
});

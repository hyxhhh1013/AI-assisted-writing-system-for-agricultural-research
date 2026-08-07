import { describe, expect, it } from "vitest";
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";

describe("translateWritingEventToProgress（结构化）", () => {
  it("status writing → stage writing + 初稿 label", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "status", status: "writing" }, createWriteProgressState()),
    ).toMatchObject({ stage: "writing", label: "正在撰写「引言」· 生成初稿…", chars: 0 });
  });

  it("status retrieving → stage retrieving（修 C2）", () => {
    const r = translateWritingEventToProgress("x", { type: "status", status: "retrieving" }, createWriteProgressState());
    expect(r).not.toBeNull();
    expect(r!.stage).toBe("retrieving");
  });

  it("status verifying / refining 映射", () => {
    expect(translateWritingEventToProgress("methods", { type: "status", status: "verifying" }, createWriteProgressState())!.stage).toBe("verifying");
    expect(translateWritingEventToProgress("results", { type: "status", status: "refining" }, createWriteProgressState())!.stage).toBe("refining");
  });

  it("info 事件累积进 info[]（修 C3）", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "info", info: "已扩大全库检索" }, state);
    expect(r!.info).toContain("已扩大全库检索");
    // 去重
    translateWritingEventToProgress("x", { type: "info", info: "已扩大全库检索" }, state);
    expect(state.info).toHaveLength(1);
  });

  it("verification_progress → 已核查 n/N 条引用", () => {
    expect(
      translateWritingEventToProgress("x", { type: "verification_progress", checked: 7, total: 15 }, createWriteProgressState()),
    ).toMatchObject({ stage: "verifying", detail: "已核查 7/15 条引用" });
  });

  it("verification 流（无标记兜底）→ 已输出 N 字", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "verification", verification: "abcde" }, state);
    expect(r!.stage).toBe("verifying");
    expect(r!.detail).toContain("已输出 5 字");
  });

  it("corrected_text / clear_result → refining（修 L3）", () => {
    expect(translateWritingEventToProgress("x", { type: "corrected_text", text: "..." }, createWriteProgressState())!.stage).toBe("refining");
    expect(translateWritingEventToProgress("x", { type: "clear_result" }, createWriteProgressState())!.stage).toBe("refining");
  });

  it("error → stage error（修 M1）", () => {
    const r = translateWritingEventToProgress("x", { type: "error", error: "AI 调用失败" }, createWriteProgressState());
    expect(r!.stage).toBe("error");
    expect(r!.detail).toContain("AI 调用失败");
  });

  it("data_claim_warnings 累积 warnings[]（修 C1）", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "data_claim_warnings", warnings: [{ claimId: "c1", claimText: "t", found: false, citedCorrectly: false }] }, state);
    expect(r!.warnings).toHaveLength(1);
    expect(state.warnings).toHaveLength(1);
  });

  it("delta 累计字数 + 节流，elapsedMs 随 now 增长", () => {
    const state = createWriteProgressState();
    const first = translateWritingEventToProgress("introduction", { type: "delta", content: "abc" }, state, 1000);
    expect(first!.detail).toContain("已 3 字");
    const throttled = translateWritingEventToProgress("introduction", { type: "delta", content: "defgh" }, state, 1500);
    expect(throttled).toBeNull();
    const third = translateWritingEventToProgress("introduction", { type: "delta", content: "ijk" }, state, 2100);
    expect(third!.detail).toContain("已 11 字");
    expect(third!.elapsedMs).toBe(1100);
  });

  it("bullet_done → 要点进度", () => {
    expect(translateWritingEventToProgress("introduction", { type: "bullet_done", bulletIndex: 1, content: "x", bulletCount: 3 }, createWriteProgressState())!.detail).toBe("要点 2/3 完成");
  });

  it("pipeline_step detail 透传", () => {
    expect(translateWritingEventToProgress("introduction", { type: "pipeline_step", step: "verifying", status: "running", detail: "加载引用原文 2/5…" }, createWriteProgressState())!.detail).toBe("加载引用原文 2/5…");
  });

  it("references / review_report 不转发", () => {
    expect(translateWritingEventToProgress("x", { type: "references", references: [] }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "review_report", report: { passed: true, summary: "", issues: [] } }, createWriteProgressState())).toBeNull();
  });
});

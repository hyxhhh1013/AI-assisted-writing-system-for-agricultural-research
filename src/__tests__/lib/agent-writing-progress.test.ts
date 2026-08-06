import { describe, expect, it } from "vitest";
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";

describe("translateWritingEventToProgress", () => {
  it("maps status writing → 生成初稿 label（含章节中文名）", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "status", status: "writing" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 生成初稿…" });
  });

  it("maps status verifying → 自动核查中", () => {
    expect(
      translateWritingEventToProgress("methods", { type: "status", status: "verifying" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「方法」· 自动核查中…" });
  });

  it("maps status refining → 修正中", () => {
    expect(
      translateWritingEventToProgress("results", { type: "status", status: "refining" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「结果」· 修正中…" });
  });

  it("returns null for non-forwarded statuses (completed / retrieving)", () => {
    expect(translateWritingEventToProgress("x", { type: "status", status: "completed" }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "status", status: "retrieving" }, createWriteProgressState())).toBeNull();
  });

  it("passes through pipeline_step detail 透传", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "pipeline_step", step: "writing", status: "done", detail: "初稿 2400 字" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 初稿 2400 字" });
  });

  it("returns null for pipeline_step without detail", () => {
    expect(
      translateWritingEventToProgress("x", { type: "pipeline_step", step: "writing", status: "running" }, createWriteProgressState()),
    ).toBeNull();
  });

  it("maps bullet_done → 要点进度", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "bullet_done", bulletIndex: 1, content: "x", bulletCount: 3 }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 要点 2/3 完成" });
  });

  it("delta 累计字数，按节流间隔发射", () => {
    const state = createWriteProgressState();
    // now=1000：首次 delta 立即发射
    const first = translateWritingEventToProgress("introduction", { type: "delta", content: "abc" }, state, 1000);
    expect(first).toEqual({ label: "正在撰写「引言」· 生成初稿… 已 3 字" });
    // now=1500（间隔 < 1000ms）：节流，不发射，但字数继续累计
    const throttled = translateWritingEventToProgress("introduction", { type: "delta", content: "defgh" }, state, 1500);
    expect(throttled).toBeNull();
    // now=2100（间隔 ≥ 1000ms）：发射累计字数 11（含本 chunk 的 3 字）
    const third = translateWritingEventToProgress("introduction", { type: "delta", content: "ijk" }, state, 2100);
    expect(third).toEqual({ label: "正在撰写「引言」· 生成初稿… 已 11 字" });
  });

  it("returns null for non-forwarded events (references / verification / error)", () => {
    expect(translateWritingEventToProgress("x", { type: "references", references: [] }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "verification", verification: "ok" }, createWriteProgressState())).toBeNull();
  });
});

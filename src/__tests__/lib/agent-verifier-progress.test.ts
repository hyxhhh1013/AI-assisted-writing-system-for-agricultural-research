import { describe, expect, it } from "vitest";
import {
  extractVerificationProgress,
  stripProgressMarkers,
} from "@/app/api/writing/pipeline/verifier";

describe("verifier 进度标记解析", () => {
  it("解析 〔进度 n/N〕 标记", () => {
    expect(extractVerificationProgress("〔进度 1/15〕引用[1]有据")).toEqual({ checked: 1, total: 15 });
  });

  it("无标记返回 null", () => {
    expect(extractVerificationProgress("引用[1]有据")).toBeNull();
  });

  it("strip 移除所有标记", () => {
    expect(stripProgressMarkers("〔进度 1/15〕\n〔进度 2/15〕\n{json}")).toBe("\n\n{json}");
  });
});

import { describe, expect, it } from "vitest";
import {
  findVerificationProgressMarkers,
  stripProgressMarkers,
} from "@/app/api/writing/pipeline/verifier";

describe("verifier 进度标记解析", () => {
  it("解析全部 〔进度 n/N〕 标记", () => {
    expect(findVerificationProgressMarkers("〔进度 1/15〕引用[1]〔进度 2/15〕")).toEqual([
      { checked: 1, total: 15 },
      { checked: 2, total: 15 },
    ]);
  });

  it("无标记返回空数组", () => {
    expect(findVerificationProgressMarkers("引用[1]有据")).toEqual([]);
  });

  it("跨 chunk 拼接后累积文本可识别完整标记", () => {
    expect(findVerificationProgressMarkers("…〔进度 1/1")).toEqual([]);
    expect(findVerificationProgressMarkers("…〔进度 1/15〕…")).toEqual([{ checked: 1, total: 15 }]);
  });

  it("strip 移除所有标记", () => {
    expect(stripProgressMarkers("〔进度 1/15〕\n〔进度 2/15〕\n{json}")).toBe("\n\n{json}");
  });
});

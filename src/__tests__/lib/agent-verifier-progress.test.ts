import { describe, expect, it } from "vitest";
import {
  findVerificationProgressMarkers,
  stripProgressMarkers,
  computeCleanEmission,
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

  it("computeCleanEmission 暂存未完成标记尾部", () => {
    expect(computeCleanEmission("...text 〔进度 1/", 0)).toEqual({ delta: "...text ", nextEmitted: 8 });
    expect(computeCleanEmission("...text more", 8)).toEqual({ delta: "more", nextEmitted: 12 });
  });

  it("computeCleanEmission 完整标记已剥离，正常发射", () => {
    expect(computeCleanEmission("text more", 0)).toEqual({ delta: "text more", nextEmitted: 9 });
  });
});

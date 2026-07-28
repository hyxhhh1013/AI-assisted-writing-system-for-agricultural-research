import { describe, expect, it } from "vitest";
import {
  LAB_DIRECTIONS,
  allLabCategoryNames,
  formatLabScopeBlock,
} from "@/lib/agent/lab-scope";

describe("lab-scope", () => {
  it("exposes four fixed directions", () => {
    expect(LAB_DIRECTIONS).toHaveLength(4);
    expect(LAB_DIRECTIONS.map((d) => d.name)).toEqual([
      "热化学",
      "烟草",
      "烟花",
      "光与植物",
    ]);
  });

  it("lists bound knowledge categories", () => {
    const cats = allLabCategoryNames();
    expect(cats).toEqual(
      expect.arrayContaining(["热化学", "热解", "烟草", "烟花", "茶学", "控释肥类"]),
    );
  });

  it("formatLabScopeBlock forbids topic pivot", () => {
    const block = formatLabScopeBlock(["热化学", "烟草"]);
    expect(block).toContain("四个研究方向");
    expect(block).toContain("禁止据此提出");
    expect(block).toContain("热化学");
  });
});

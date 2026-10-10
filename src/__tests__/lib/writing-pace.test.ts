import { describe, expect, it } from "vitest";
import { alignWritingPace, defaultWritingPace } from "@/lib/writing-pace";

describe("writing pace", () => {
  it("defaults introduction and conclusion to together", () => {
    expect(defaultWritingPace("引言", "research")).toBe("together");
    expect(defaultWritingPace("结论", "research")).toBe("together");
    expect(defaultWritingPace("材料与方法", "research")).toBe("step");
    expect(defaultWritingPace("结果与分析 > 吸附", "research")).toBe("step");
    expect(defaultWritingPace("讨论", "research")).toBe("step");
  });

  it("aligns pace to the order and keeps explicit choices", () => {
    expect(alignWritingPace(
      ["材料与方法", "引言", "结论"],
      ["together", "写完停"],
      "research",
    )).toEqual(["together", "step", "together"]);
  });
});

import { describe, expect, it } from "vitest";
import { checkWritingQuality } from "@/lib/agent/writing-quality";

describe("checkWritingQuality", () => {
  it("干净文本无发现", () => {
    const text = [
      "本研究以生物炭为原料，考察了不同热解温度对孔隙结构的影响。",
      "结果表明，在 600°C 下比表面积达到最大值。",
      "该结果与文献报道一致。",
    ].join("\n");
    expect(checkWritingQuality(text)).toEqual([]);
  });

  it("喉清开场：识别「众所周知/值得注意的是」式开场", () => {
    const text = [
      "众所周知，生物炭具有优异的吸附性能。",
      "值得注意的是，热解温度对孔隙影响显著。",
      "此外，原料来源同样关键。",
    ].join("\n");
    const findings = checkWritingQuality(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("throat_clear");
    expect(findings[0].count).toBe(2);
  });

  it("喉清开场：单次不告警", () => {
    const text = "值得注意的是，该指标波动明显。";
    expect(checkWritingQuality(text)).toEqual([]);
  });

  it("综上所述堆砌：连续多个结论连接词", () => {
    const text = [
      "综上所述，该方法可行。",
      "总而言之，实验重复性良好。",
      "总体而言，数据支撑结论。",
    ].join("\n");
    const findings = checkWritingQuality(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("connective_overuse");
    expect(findings[0].count).toBe(3);
  });

  it("overclaim：识别绝对化表述", () => {
    const text = "这种材料绝对是最优选择，毫无疑问能彻底解决问题。";
    const findings = checkWritingQuality(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("overclaim");
    expect(findings[0].count).toBe(3);
  });

  it("段长方差过低：多段长度过于均匀告警", () => {
    const text = [
      "这一段的主要内容是描述实验过程与实验条件。",
      "另一段的主要内容是描述实验结果与数据分布。",
      "第三段的主要内容是描述实验分析与最终结论。",
    ].join("\n");
    const findings = checkWritingQuality(text);
    expect(findings.some((f) => f.rule === "para_variance")).toBe(true);
  });

  it("段长方差正常：段落长度差异大不告警", () => {
    const text = [
      "短。",
      "这是一段非常长的段落，包含大量细节描述和论证展开，用于说明段落长度方差检测不会被误触发。",
      "中段内容。",
    ].join("\n");
    expect(checkWritingQuality(text).some((f) => f.rule === "para_variance")).toBe(false);
  });

  it("少于 3 段不做方差检查", () => {
    const text = "仅一段内容。";
    expect(checkWritingQuality(text).some((f) => f.rule === "para_variance")).toBe(false);
  });
});

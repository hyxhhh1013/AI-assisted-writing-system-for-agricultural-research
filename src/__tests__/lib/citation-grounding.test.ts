import { describe, expect, it } from "vitest";
import {
  evaluateCitationGrounding,
  termOverlapRatio,
  computeSoftGroundPoolStats,
} from "@/lib/citation-grounding";

describe("termOverlapRatio", () => {
  it("scores high when sentence shares domain terms with abstract", () => {
    const sentence =
      "生物炭施用后土壤容重显著降低，总孔隙度增加，团聚体稳定性提高。";
    const abstract =
      "Meta分析表明生物炭降低土壤容重、增加孔隙度并改善团聚体稳定性。";
    expect(termOverlapRatio(sentence, abstract)).toBeGreaterThan(0.15);
  });

  it("scores low when topics diverge", () => {
    const sentence = "量子纠缠实验验证了贝尔不等式在超导电路中的破坏。";
    const abstract =
      "生物炭施用显著改善红壤酸度和有效磷含量，提高玉米产量。";
    expect(termOverlapRatio(sentence, abstract)).toBeLessThan(0.12);
  });
});

describe("evaluateCitationGrounding", () => {
  const refs = [
    {
      index: 1,
      title: "生物炭对土壤容重与孔隙度的影响：Meta分析",
      abstract:
        "对八十五项田间与室内研究的综合分析显示，生物炭施用显著降低土壤容重并增加总孔隙度，该效应在不同土壤类型与施用剂量下总体稳定，为土壤结构改良与水分保持提供了系统证据支持，并讨论了原料与热解温度对物理效应的调节作用。",
    },
    {
      index: 2,
      title: "超导电路中的量子纠缠",
      abstract:
        "我们在毫开尔文温度下利用纠缠超导量子比特演示了贝尔不等式的破坏，并讨论了退相干与测量保真度对纠缠态制备的影响，为量子计算器件与量子信息处理提供了关键实验基础与误差分析框架。",
    },
    {
      index: 3,
      title: "Short",
      abstract: "tiny",
    },
    {
      index: 4,
      title: "Biochar and soil physical properties: a review",
      abstract:
        "Biochar application reduces bulk density and increases porosity in agricultural soils according to field trials across multiple climate zones and feedstock types with detailed meta-regression.",
    },
  ];

  it("flags in-bounds but semantically mismatched citation", () => {
    const draft =
      "生物炭可显著降低土壤容重并提高孔隙度[2]。量子器件工作在极低温[1]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.checkedCount).toBe(2);
    expect(report.suspiciousCount).toBeGreaterThanOrEqual(1);
    const byNum = Object.fromEntries(
      report.hits.filter((h) => h.suspicious).map((h) => [h.number, h]),
    );
    expect(byNum[2]?.suspicious).toBe(true);
    expect(report.hint).toMatch(/重叠偏低|核对/);
  });

  it("does not flag aligned citation", () => {
    const draft =
      "多项研究表明生物炭显著降低土壤容重并增加总孔隙度[1]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.suspiciousCount).toBe(0);
  });

  it("marks short refs as ungroundable rather than suspicious", () => {
    const draft = "随便一句话挂上编号[3]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.ungroundableCount).toBeGreaterThanOrEqual(1);
    const hit = report.hits.find((h) => h.number === 3);
    expect(hit?.groundable).toBe(false);
    expect(hit?.suspicious).toBe(false);
  });

  it("skips bilingual mismatch instead of false-positive", () => {
    const draft = "生物炭降低容重并提高孔隙度已有系统证据[4]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    // 中文句 vs 英文摘要 → 不判可疑
    expect(report.suspiciousCount).toBe(0);
    expect(report.ungroundableCount).toBeGreaterThanOrEqual(1);
  });

  it("handles citation groups [1,2]", () => {
    const draft =
      "生物炭降低容重并提高孔隙度的效应已有系统证据[1, 2]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.checkedCount).toBe(2);
    expect(report.suspiciousCount).toBeGreaterThanOrEqual(1);
  });

  it("reports soft-grounded unused pool", () => {
    const draft = "仅引用第一条[1]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.softPool.softGroundableCount).toBeGreaterThanOrEqual(2);
    expect(report.softPool.softUnusedIndexes.length).toBeGreaterThan(0);
    expect(report.softPool.unusedRatio).toBeGreaterThan(0);
  });
});

describe("computeSoftGroundPoolStats", () => {
  it("returns null unusedRatio when no soft pool", () => {
    const stats = computeSoftGroundPoolStats(
      [{ index: 1, title: "A", abstract: "short" }],
      [1],
    );
    expect(stats.softGroundableCount).toBe(0);
    expect(stats.unusedRatio).toBeNull();
  });
});

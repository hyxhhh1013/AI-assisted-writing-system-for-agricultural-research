import { describe, expect, it } from "vitest";
import {
  evaluateCitationGrounding,
  isFilenameOnlyRef,
  isPdfPageScrapeRef,
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
    expect(report.blocksExport).toBe(true);
    expect(report.hint).toMatch(/错引|对不上|改号/);
  });

  it("does not flag aligned citation", () => {
    const draft =
      "多项研究表明生物炭显著降低土壤容重并增加总孔隙度[1]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.suspiciousCount).toBe(0);
    expect(report.blocksExport).toBe(false);
  });

  it("does not block export on Elsevier header and reference-list scraps", () => {
    const scrap = {
      index: 1,
      title:
        "[J] Wei Luo (2022) Bioresource Technology 349 (2022) 126845 Contents lists available at ScienceDirect",
      abstract:
        "W. Luo et al. Bioresource Technology 349 (2022) 126845 Persson, H., Duman, I., Wang, S., 2018. Effect of pyrolysis.",
    };
    expect(isPdfPageScrapeRef(scrap)).toBe(true);
    const report = evaluateCitationGrounding({
      draftText: "热解温度升高通常降低生物炭产率并提高芳香性[1]。",
      references: [scrap],
    });
    expect(report.hits.find((h) => h.number === 1)?.groundable).toBe(false);
    expect(report.suspiciousCount).toBe(0);
    expect(report.blocksExport).toBe(false);
  });

  it("does not remap onto PDF filenames or swap two filename-only refs", () => {
    const header = {
      index: 1,
      title:
        "[J] 黄升雄 (2022) Science of the Total Environment 802 (2022) 149752 Contents lists available at ScienceDirect",
      abstract:
        "Contents lists available at ScienceDirect Science of the Total Environment journal homepage.",
    };
    const fileA = {
      index: 25,
      title: "",
      content: "2022-marta-综述-从废物到肥料：通过原始和工程生物炭从废水中回收养分.pdf",
    };
    const fileB = {
      index: 27,
      title: "",
      content: "28-2024-董航-油茶壳与聚丙烯共热解过程中热解产物分布的研究.pdf",
    };
    expect(isFilenameOnlyRef(fileA)).toBe(true);
    expect(isFilenameOnlyRef(fileB)).toBe(true);
    const report = evaluateCitationGrounding({
      draftText:
        "湿式烘焙通过溶出碱金属与半纤维素降低灰分含量并改变炭表面官能团[25]；烘焙类预处理研究[1]多以各自参数体系报道。金属改性被认为可能提升吸附能力[27]。",
      references: [header, fileA, fileB],
    });
    for (const n of [1, 25, 27]) {
      const hit = report.hits.find((h) => h.number === n);
      expect(hit?.groundable).toBe(false);
      expect(hit?.suspicious).toBe(false);
      expect(hit?.betterNumber).toBeUndefined();
    }
    expect(report.blocksExport).toBe(false);
    expect(report.hint).not.toMatch(/→\[/);
  });

  it("marks short refs as ungroundable rather than suspicious", () => {
    const draft = "随便一句话挂上编号[3]。";
    const report = evaluateCitationGrounding({ draftText: draft, references: refs });
    expect(report.ungroundableCount).toBeGreaterThanOrEqual(1);
    const hit = report.hits.find((h) => h.number === 3);
    expect(hit?.groundable).toBe(false);
    expect(hit?.suspicious).toBe(false);
  });

  it("does not block export when a Chinese sentence cannot be matched to an English abstract", () => {
    const report = evaluateCitationGrounding({
      draftText: "油菜秆生物炭在厌氧培养中降低了土壤有效态镉，并生成硫化物与弱结晶铁氧化物[1]。",
      references: [
        {
          index: 1,
          title: "Rape straw biochar, sulfide and poorly crystallized Fe oxide",
          abstract:
            "Rape straw biochar reduced available cadmium under anaerobic incubation and formed sulfide and poorly crystallized iron oxides.",
        },
      ],
    });
    expect(report.hits.find((h) => h.number === 1)?.suspicious).not.toBe(true);
    expect(report.blocksExport).toBe(false);
    expect(report.hint).not.toMatch(/禁止导出/);
  });

  it("grounds bilingual citation via synonym expansion instead of skipping", () => {
    const draft = "生物炭降低容重并提高孔隙度已有系统证据[1]。";
    const report = evaluateCitationGrounding({
      draftText: draft,
      references: [{ ...refs[3], index: 1 }],
    });
    expect(report.suspiciousCount).toBe(0);
    expect(report.blocksExport).toBe(false);
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

  it("does not let collection words hide a wrong paper in the same field", () => {
    const fieldRefs = [
      {
        index: 1,
        title: "Effect of pretreatment temperature on biochar yield from biomass pyrolysis",
        abstract:
          "Biomass pyrolysis produces biochar. Pretreatment temperature and drying conditions changed char yield and volatile release during slow pyrolysis of straw.",
      },
      {
        index: 2,
        title: "Nickel modification of biochar catalysts for tar reforming",
        abstract:
          "Biomass pyrolysis produces biochar. Ni metal loading on biochar increased catalytic activity for tar reforming compared with unmodified char.",
      },
    ];
    const wrong = evaluateCitationGrounding({
      draftText: "金属镍改性可提高焦油重整催化活性[1]。",
      references: fieldRefs,
    });
    expect(wrong.suspiciousCount).toBeGreaterThanOrEqual(1);
    expect(wrong.hits.find((h) => h.number === 1)?.suspicious).toBe(true);
    expect(wrong.blocksExport).toBe(true);

    const right = evaluateCitationGrounding({
      draftText: "预处理温度显著影响生物炭产率[1]。",
      references: fieldRefs,
    });
    expect(right.hits.find((h) => h.number === 1)?.suspicious).not.toBe(true);

    const generic = evaluateCitationGrounding({
      draftText: "生物质热解是制备生物炭的常用途径[1]。",
      references: fieldRefs,
    });
    expect(generic.suspiciousCount).toBe(0);
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

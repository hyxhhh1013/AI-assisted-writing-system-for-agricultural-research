/**
 * WRITE-QA-008：分节 golden。规则尺锁 code，不调 LLM。
 */

import type { EvidenceClaim } from "@/contracts/data-source";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import type { WritingQaReport } from "@/contracts/writing-qa";
import { evaluateSectionWritingQa } from "@/lib/agent/writing-qa-run";

export interface WriteQaGolden {
  id: string;
  sectionKey: string;
  subsectionTitle?: string;
  expect: "pass" | "repair" | "block";
  expectCodes?: string[];
  forbidCodes?: string[];
  text: string;
  dataClaims?: EvidenceClaim[];
  spec?: SectionSpecV1;
  maxRefIndex?: number;
}

const SOC_CLAIM: EvidenceClaim = {
  id: "D1-C1",
  sourceId: "D1",
  sourceType: "data",
  type: "mean",
  text: "处理组土壤有机碳 18.6",
  values: { mean: 18.6 },
  variables: ["土壤有机碳"],
  tolerance: 5,
};

const INTRO_PASS =
  "盐碱地秸秆还田腐解慢，养分释放不均，热解制备生物炭是减量化途径[1]。已有研究确认热解温度调控产率与元素赋存[2]。"
  + "然而针对耐盐碱水稻秸秆，氮磷钾在固相中的保留率仍不清楚，不同温度下的形态变化证据不足。"
  + "因此本文考察 300～700℃ 下产率与营养元素迁移，为盐碱地秸秆资源化提供数据。";

const METHODS_PASS =
  "秸秆采自滨海盐碱地，风干粉碎过 60 目。管式炉在 300、400、500、600、700℃ 限氧热解，升温 10℃/min，保温 60 min，氮气保护。"
  + "产率按固体与原料质量比计算，灰分按 750℃ 灼烧法。氮用凯氏定氮，磷用钼锑抗比色，钾用火焰光度。每处理三次重复，单因素方差分析。";

const RESULTS_PASS =
  "热解温度由 300℃ 升至 700℃ 时，处理组土壤有机碳为 18.6 g/kg。见图 2.1。差异显著（p = 0.05）。"
  + "田间小区设置三个重复，灰分相应升高。";

const DISCUSSION_PASS =
  "产率随温度下降，与秸秆热解文献一致[1]。钾更易挥发，磷更易滞留固相。若以养分固存为目标，宜选中等温度。"
  + "局限在于未做田间尺度验证，外推须谨慎。";

const REVIEW_PASS =
  "已有田间试验表明生物炭可提高土壤有机碳并改善团聚体[1]。不同热解温度下产率与孔隙差异明显[2]。"
  + "各研究在原料与保温时间上并不一致，转述时需对照试验条件。";

export const WRITE_QA_GOLDENS: WriteQaGolden[] = [
  {
    id: "introduction/pass",
    sectionKey: "introduction",
    expect: "pass",
    forbidCodes: ["throat_clear", "hollow_phrase", "intro_gap_missing"],
    text: INTRO_PASS,
  },
  {
    id: "introduction/fail",
    sectionKey: "introduction",
    expect: "repair",
    expectCodes: ["throat_clear", "hollow_phrase"],
    text:
      "众所周知，生物炭具有重要的意义。值得注意的是，它也展现出较大的潜力。热解温度影响产率。",
  },
  {
    id: "methods/pass",
    sectionKey: "methods",
    expect: "pass",
    forbidCodes: ["md_heading"],
    text: METHODS_PASS,
  },
  {
    id: "methods/fail",
    sectionKey: "methods",
    expect: "repair",
    expectCodes: ["md_heading"],
    text: "### 热解\n采用常规方法在标准条件下热解秸秆。样品测定前混匀。",
  },
  {
    id: "results/pass",
    sectionKey: "results",
    expect: "pass",
    forbidCodes: ["number_not_in_claims", "results_discussion_bleed"],
    text: RESULTS_PASS,
    dataClaims: [SOC_CLAIM],
  },
  {
    id: "results/fail",
    sectionKey: "results",
    expect: "block",
    expectCodes: ["number_not_in_claims"],
    text: "处理组产量为 99.99 kg/ha。这可能反映根系吸收增强。田间小区设置三个重复。",
    dataClaims: [SOC_CLAIM],
  },
  {
    id: "discussion/pass",
    sectionKey: "discussion",
    expect: "pass",
    forbidCodes: ["overclaim"],
    text: DISCUSSION_PASS,
  },
  {
    id: "discussion/fail",
    sectionKey: "discussion",
    expect: "repair",
    expectCodes: ["overclaim"],
    text: "本研究毫无疑问证明生物炭最优，显著优于一切现有改良剂。田间小区设置三个重复。",
  },
  {
    id: "literature_body/pass",
    sectionKey: "literature_body",
    subsectionTitle: "生物炭与有机碳",
    expect: "pass",
    forbidCodes: ["review_as_experiment"],
    text: REVIEW_PASS,
  },
  {
    id: "literature_body/fail",
    sectionKey: "literature_body",
    subsectionTitle: "生物炭与有机碳",
    expect: "repair",
    expectCodes: ["review_as_experiment"],
    text: "本研究田间试验表明处理组产量显著高于对照。小区设置三个重复，测定土壤有机碳。",
  },
];

export interface WriteQaGoldenRun {
  id: string;
  report: WritingQaReport;
  ok: boolean;
  detail: string;
}

export function runWriteQaGolden(g: WriteQaGolden): WriteQaGoldenRun {
  const report = evaluateSectionWritingQa({
    text: g.text,
    sectionKey: g.sectionKey,
    dataClaims: g.dataClaims,
    spec: g.spec,
    maxRefIndex: g.maxRefIndex,
  });
  const codes = report.findings.map((f) => f.code);
  const missing = (g.expectCodes ?? []).filter((c) => !codes.includes(c));
  const unexpected = (g.forbidCodes ?? []).filter((c) => codes.includes(c));
  const verdictOk = report.verdict === g.expect;
  const ok = verdictOk && missing.length === 0 && unexpected.length === 0;
  const bits: string[] = [];
  if (!verdictOk) bits.push(`verdict ${report.verdict}≠${g.expect}`);
  if (missing.length) bits.push(`缺 ${missing.join(",")}`);
  if (unexpected.length) bits.push(`多 ${unexpected.join(",")}`);
  return {
    id: g.id,
    report,
    ok,
    detail: ok ? codes.join(",") || "无 findings" : bits.join("；"),
  };
}

export function evaluateWriteQaGoldens(): WriteQaGoldenRun[] {
  return WRITE_QA_GOLDENS.map(runWriteQaGolden);
}

export function assertWriteQaGoldens(): { ok: boolean; failures: string[] } {
  const runs = evaluateWriteQaGoldens();
  const failures = runs.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`);
  return { ok: failures.length === 0, failures };
}

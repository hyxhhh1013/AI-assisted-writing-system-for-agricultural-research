/**
 * 端到端：通过写作管道生成一篇完整论文，并输出质量诊断。
 * 运行：npx tsx scripts/eval-pipeline-paper.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { runWritingPipeline } from "../src/app/api/writing/run-pipeline";
import type { WritingGlobalContext } from "../src/app/api/writing/types";
import type { WritingSSEEvent } from "../src/contracts/sse";
import type { WritingInput } from "../src/lib/validations";
import { stripInlineCitations } from "../src/lib/abstract-utils";
import { IMRAD_LABELS_SHORT_ZH } from "../src/lib/imrad";
import { mergeSectionReferencesIntoProject } from "../src/lib/reference-reorder";

const TITLE = "不同温度下耐盐碱水稻秸秆热解过程中关键营养元素的迁移转化研究";
const RESEARCH_DIRECTION =
  "热化学；生物质热解；水稻秸秆；生物炭；氮磷钾等营养元素随热解温度的迁移与固存";
const PROJECT_MODE = "research" as const;
const OUT_DIR = path.join(process.cwd(), ".tmp", "pipeline-eval");
const MODE = (process.env.EVAL_WRITE_MODE as "fast" | "full") || "full";

type SectionKey = "introduction" | "methods" | "results" | "conclusion" | "abstract";

interface SectionSpec {
  key: SectionKey;
  bullets: string[];
  context: string;
  subsectionTitle?: string;
}

const SECTIONS: SectionSpec[] = [
  {
    key: "introduction",
    subsectionTitle: "引言",
    bullets: [
      "耐盐碱水稻秸秆资源化与盐碱地农业废弃物处置需求",
      "热解温度是调控生物炭产率及营养元素赋存形态的关键因素",
      "阐明 N、P、K 等关键营养元素在不同温度热解中的迁移转化意义",
    ],
    context:
      "写研究论文引言：交代背景、科学问题与研究目的；引用热解/生物炭相关文献；不要编造本试验尚未给出的具体数据。",
  },
  {
    key: "methods",
    subsectionTitle: "材料与方法",
    bullets: [
      "耐盐碱水稻秸秆原料采集、预处理与工业分析/元素分析",
      "固定床或管式炉热解：设定若干终温（如 300–700℃）及升温、保温制度",
      "生物炭产率、灰分及 N、P、K 等营养元素含量与形态分析方法",
    ],
    context:
      "写材料与方法：按常规生物质热解试验表述；温度梯度、气氛、停留时间等参数可参照检索文献中的典型设置说明，并标明为试验设计；检测方法写清原理，避免捏造仪器型号细节。",
  },
  {
    key: "results",
    subsectionTitle: "结果与讨论",
    bullets: [
      "不同热解温度下生物炭产率、灰分与固定碳变化",
      "N、P、K 等关键营养元素在固相产物中的保留率与迁移趋势",
      "温度升高对元素挥发损失、富集及潜在农业回用价值的讨论",
    ],
    context:
      "写结果与讨论：优先依据检索到的秸秆/生物质热解与营养元素迁移文献归纳规律；若引用具体百分比，须与参考来源一致；对比不同温度下的差异并讨论机理，不要写成无关领域（茶学/烟花）。",
  },
  {
    key: "conclusion",
    subsectionTitle: "结论",
    bullets: [
      "归纳热解温度对秸秆生物炭产率及营养元素固存的主要结论",
      "指出适宜农业回用的温度区间或权衡关系",
      "说明局限与后续可开展的田间验证方向",
    ],
    context:
      "写结论：紧扣前文，语气审慎，不夸大未验证的田间效果。",
  },
  {
    key: "abstract",
    subsectionTitle: "摘要",
    bullets: [
      "概述研究目的、热解温度设置与关注的营养元素",
      "概括主要结果趋势与机理认识",
      "点明对秸秆资源化/盐碱区农业废弃物利用的启示",
    ],
    context:
      "基于已完成正文提炼中文摘要，不放文内引用编号，不编造正文未出现的新数据。",
  },
];

interface SectionResult {
  key: SectionKey;
  label: string;
  draft: string;
  references: string[];
  verification?: string;
  infos: string[];
  warnings: string[];
  citationWarnings: string[];
  elapsedMs: number;
  groundedHint?: string;
}

function collectEvents(events: WritingSSEEvent[]) {
  let draft = "";
  let references: string[] = [];
  let verification: string | undefined;
  const infos: string[] = [];
  const citationWarnings: string[] = [];
  let groundedHint: string | undefined;

  for (const event of events) {
    switch (event.type) {
      case "clear_result":
        draft = "";
        break;
      case "delta":
        draft += event.content;
        break;
      case "corrected_text":
        draft = event.text;
        break;
      case "references":
        references = event.references;
        break;
      case "verification":
        verification = event.verification;
        break;
      case "info":
        infos.push(event.info);
        if (event.info.includes("扩大到全库") || event.info.includes("摘要") || event.info.includes("主题")) {
          groundedHint = event.info;
        }
        break;
      case "citation_warnings":
        citationWarnings.push(
          ...event.warnings.map((w) => `[${w.num}] overlap=${w.overlap}%`),
        );
        break;
      case "error":
        throw new Error(event.error);
      default:
        break;
    }
  }

  return {
    draft: draft.trim(),
    references,
    verification,
    infos,
    warnings: [] as string[],
    citationWarnings,
    groundedHint,
  };
}

async function writeSection(
  spec: SectionSpec,
  existingReferences: string[],
  globalContext: WritingGlobalContext | undefined,
  sectionBodies: Record<string, string>,
): Promise<SectionResult> {
  const events: WritingSSEEvent[] = [];
  const emit = (event: WritingSSEEvent) => {
    events.push(event);
    if (event.type === "pipeline_step") {
      process.stdout.write(
        `\r  [${spec.key}] ${event.step}/${event.status}${event.detail ? ` — ${event.detail.slice(0, 40)}` : ""}          `,
      );
    }
  };

  const data: WritingInput = {
    title: TITLE,
    section: spec.key,
    language: "zh",
    template: "sci",
    mode: MODE,
    retrievalMode: "balanced",
    researchDirection: RESEARCH_DIRECTION,
    projectMode: PROJECT_MODE,
    citationStyle: "gbt7714",
    bullets: spec.bullets,
    context: spec.context,
    subsectionTitle: spec.subsectionTitle,
    existingReferences,
    dataClaims: [],
    globalContext:
      spec.key === "abstract"
        ? { ...globalContext, sectionBodies }
        : globalContext,
  };

  const context =
    spec.key === "abstract"
      ? spec.context
      : [`【本节扩写要点】`, ...spec.bullets.map((b, i) => `${i + 1}. ${b}`), "", "【补充说明】", spec.context].join(
          "\n",
        );

  const started = Date.now();
  const ac = new AbortController();
  const req = new Request("http://eval-internal/api/writing", { signal: ac.signal });

  await runWritingPipeline({
    req,
    data,
    context,
    dataClaims: [],
    globalContext: data.globalContext as WritingGlobalContext | undefined,
    userId: "pipeline-eval",
    emit,
    finishStream: () => undefined,
  });

  process.stdout.write("\n");
  const collected = collectEvents(events);
  let draft = collected.draft;
  if (spec.key === "abstract") {
    draft = stripInlineCitations(draft);
  }

  return {
    key: spec.key,
    label: IMRAD_LABELS_SHORT_ZH[spec.key],
    draft,
    references: collected.references,
    verification: collected.verification,
    infos: collected.infos,
    warnings: collected.warnings,
    citationWarnings: collected.citationWarnings,
    elapsedMs: Date.now() - started,
    groundedHint: collected.groundedHint,
  };
}

function extractCitations(text: string): number[] {
  const nums = new Set<number>();
  for (const m of text.matchAll(/\[(\d+(?:\s*[,，、\-–—]\s*\d+)*)\]/g)) {
    const parts = m[1].split(/[,，、\-–—]/).map((s) => parseInt(s.trim(), 10));
    for (const n of parts) {
      if (Number.isFinite(n)) nums.add(n);
    }
  }
  return [...nums].sort((a, b) => a - b);
}

function analyzeQuality(results: SectionResult[], allRefs: string[]) {
  const issues: string[] = [];
  const strengths: string[] = [];
  const perSection: Record<string, unknown>[] = [];

  for (const r of results) {
    const cites = extractCitations(r.draft);
    const maxCite = cites.length ? Math.max(...cites) : 0;
    const oob = cites.filter((n) => n < 1 || n > allRefs.length);
    const charCount = r.draft.replace(/\s+/g, "").length;
    const hasMethodsSmell =
      /材料与方法|试验设计|随机区组|测定方法|统计分析/.test(r.draft) &&
      r.key === "introduction";
    const hasResultsSmell =
      /本研究表明|本试验结果表明|我们的结果/.test(r.draft) && r.key !== "abstract";

    const sectionIssues: string[] = [];
    if (charCount < 400 && r.key !== "abstract") sectionIssues.push(`正文偏短（${charCount}字）`);
    if (r.key === "abstract" && charCount < 150) sectionIssues.push(`摘要偏短（${charCount}字）`);
    if (r.key === "abstract" && cites.length > 0) {
      sectionIssues.push(`摘要仍含引用 ${cites.map((n) => `[${n}]`).join("")}`);
    }
    if (r.key !== "abstract" && cites.length === 0) sectionIssues.push("无文内引用");
    if (oob.length) sectionIssues.push(`越界引用: ${oob.join(",")}`);
    if (hasMethodsSmell) sectionIssues.push("出现实验材料/方法口吻（综述不该写）");
    if (hasResultsSmell) sectionIssues.push("出现“本研究/本试验”口吻");
    if (r.citationWarnings.length) sectionIssues.push(`citation_warnings: ${r.citationWarnings.join("; ")}`);
    if (r.warnings.length) sectionIssues.push(`warnings: ${r.warnings.join("; ")}`);
    if (r.groundedHint?.includes("仍无可用")) sectionIssues.push(r.groundedHint);

    if (charCount >= 800 && r.key !== "abstract") strengths.push(`${r.label}篇幅充足（${charCount}字）`);
    if (cites.length >= 3 && r.key !== "abstract") strengths.push(`${r.label}引用较密（${cites.length}处编号）`);
    if (r.key === "abstract" && cites.length === 0 && charCount >= 200) {
      strengths.push("摘要无引用且有实质内容");
    }

    issues.push(...sectionIssues.map((s) => `[${r.label}] ${s}`));
    perSection.push({
      key: r.key,
      label: r.label,
      chars: charCount,
      citations: cites,
      maxCite,
      refsReturned: r.references.length,
      elapsedSec: Math.round(r.elapsedMs / 1000),
      infos: r.infos,
      sectionIssues,
      preview: r.draft.slice(0, 180).replace(/\n/g, " "),
    });
  }

  // 章节间引用连续性：后文应能复用前文编号范围
  const introCites = extractCitations(results.find((x) => x.key === "introduction")?.draft || "");
  const resultsCites = extractCitations(results.find((x) => x.key === "results")?.draft || "");
  if (introCites.length && resultsCites.length) {
    const overlap = resultsCites.filter((n) => introCites.includes(n));
    if (overlap.length === 0 && allRefs.length > 5) {
      issues.push("引言与结果讨论引用集合几乎无重叠，可能存在参考文献表膨胀/编号漂移风险");
    } else if (overlap.length > 0) {
      strengths.push(`引言与结果讨论共享引用编号 ${overlap.slice(0, 5).join(",")}`);
    }
  }

  if (allRefs.length < 5) issues.push(`参考文献总量偏少（${allRefs.length}）`);
  if (allRefs.length >= 8) strengths.push(`累计参考文献 ${allRefs.length} 条`);

  return { issues, strengths, perSection, refCount: allRefs.length };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`标题: ${TITLE}`);
  console.log(`项目类型: ${PROJECT_MODE} | 写作模式: ${MODE} | 输出: ${OUT_DIR}`);
  console.log(`RAG_WARMUP=${process.env.RAG_WARMUP ?? "(default)"}`);

  const results: SectionResult[] = [];
  let existingReferences: string[] = [];
  const sectionBodies: Record<string, string> = {};
  const globalContext: WritingGlobalContext = {
    outline:
      "1 引言\n2 材料与方法（原料、热解制度、元素分析）\n3 结果与讨论（产率与 N/P/K 迁移）\n4 结论\n（摘要最后写）",
  };

  for (const spec of SECTIONS) {
    console.log(`\n=== 写作 ${IMRAD_LABELS_SHORT_ZH[spec.key]} (${spec.key}) ===`);
    const result = await writeSection(spec, existingReferences, globalContext, sectionBodies);
    results.push(result);
    if (result.references.length > 0) {
      const merged = mergeSectionReferencesIntoProject({
        sectionText: result.draft,
        sectionReferences: result.references,
        projectReferences: existingReferences,
      });
      result.draft = merged.text;
      existingReferences = merged.references;
      result.references = merged.references;
    }
    if (spec.key !== "abstract") {
      sectionBodies[spec.key] = result.draft;
    }
    console.log(
      `  完成: ${result.draft.replace(/\s+/g, "").length}字, refs=${result.references.length}, ${Math.round(result.elapsedMs / 1000)}s`,
    );
    if (result.infos.length) console.log(`  info: ${result.infos.join(" | ")}`);
    if (result.citationWarnings.length) {
      console.log(`  citation_warnings: ${result.citationWarnings.join(" | ")}`);
    }
  }

  const paperParts = [
    `# ${TITLE}`,
    "",
    `> 管道评估自动生成 | mode=${MODE} | ${new Date().toISOString()}`,
    "",
  ];
  for (const r of results) {
    paperParts.push(`## ${r.label}`);
    paperParts.push("");
    paperParts.push(r.draft);
    paperParts.push("");
  }
  paperParts.push("## 参考文献");
  paperParts.push("");
  const finalRefs = results[results.length - 1]?.references?.length
    ? results[results.length - 1].references
    : existingReferences;
  // 用最后有 refs 的章节
  let refs = finalRefs;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].references.length > 0) {
      refs = results[i].references;
      break;
    }
  }
  refs.forEach((ref, i) => paperParts.push(`[${i + 1}] ${ref}`));

  const paperPath = path.join(OUT_DIR, "paper.md");
  fs.writeFileSync(paperPath, paperParts.join("\n"), "utf-8");

  const analysis = analyzeQuality(results, refs);
  const report = {
    title: TITLE,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    strengths: analysis.strengths,
    issues: analysis.issues,
    perSection: analysis.perSection,
    refCount: analysis.refCount,
    references: refs,
  };
  const reportPath = path.join(OUT_DIR, "quality-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n========== 质量诊断 ==========");
  console.log("优点:");
  for (const s of analysis.strengths) console.log(`  + ${s}`);
  console.log("问题:");
  if (!analysis.issues.length) console.log("  （自动规则未检出明显问题）");
  for (const i of analysis.issues) console.log(`  - ${i}`);
  console.log(`\n论文: ${paperPath}`);
  console.log(`报告: ${reportPath}`);

  // W3-E2E-EVAL：严格模式下，越界引用 / 关键问题直接失败（供本地门禁）
  if (process.env.EVAL_STRICT === "1") {
    const critical = analysis.issues.filter(
      (i) => i.includes("越界引用") || i.includes("无文内引用") || i.includes("摘要仍含引用"),
    );
    if (critical.length > 0) {
      console.error("\nEVAL_STRICT=1：检出关键质量问题，退出码 1");
      for (const c of critical) console.error(`  - ${c}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("\n评估失败:", err);
  process.exit(1);
});

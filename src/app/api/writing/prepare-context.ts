import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingInput } from "@/lib/validations";
import {
  buildDomainExpertise,
  resolveSectionPrompt,
  buildWriterSystemPrompt,
} from "@/lib/prompts";
import { getTemplateSectionNumber } from "@/lib/template-sections";
import { getSectionNumberForMode } from "@/lib/section-registry";
import { retrieveWritingContext } from "@/services/writing-context";
import { buildEvidencePack } from "@/services/evidence-pack";
import type { WritingPipelineEmit, PreparedWritingContext, WritingGlobalContext } from "./types";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function prepareWritingContext(
  data: WritingInput,
  context: string,
  dataClaims: EvidenceClaim[],
  globalContext: WritingGlobalContext | undefined,
  emit: WritingPipelineEmit,
): Promise<PreparedWritingContext> {
  const {
    title,
    section,
    language,
    template,
    existingReferences = [],
    researchDirection,
    retrievalMode,
    subsectionTitle,
    figureStart,
    evidenceSummary: manualEvidenceSummary,
    projectMode,
    citationStyle,
  } = data;

  emit({ type: "status", status: "retrieving" });
  emit({ type: "pipeline_step", step: "retrieving", status: "running", detail: "正在检索相关文献..." });

  const {
    contextText,
    refMapping,
    referencesByIndex,
    newSources,
    refRangeHint,
  } = await retrieveWritingContext(
    {
      title,
      section,
      context,
      language,
      template: template || "sci",
      existingReferences,
      researchDirection,
      retrievalMode,
      projectMode,
    },
    existingReferences,
  );

  const refCount = referencesByIndex.length;
  const dataClaimCount = dataClaims.length;
  emit({
    type: "pipeline_step",
    step: "retrieving",
    status: "done",
    detail: `找到 ${refCount} 条可引用文献`,
  });
  await tick(40);

  emit({ type: "pipeline_step", step: "building_context", status: "running", detail: "正在整理证据包..." });
  const evidencePack = buildEvidencePack({
    mode: projectMode || "review",
    existingReferences,
    dataClaims,
    ragChunks: [],
    formatRagCitation: undefined,
  });
  const evidenceSummary = manualEvidenceSummary || evidencePack.summary;
  emit({
    type: "pipeline_step",
    step: "building_context",
    status: "done",
    detail: `引用范围 [1]-[${refCount || 0}]${dataClaimCount > 0 ? `，数据证据 ${dataClaimCount} 条` : ""}`,
  });
  await tick(40);

  const isGBT = template === "gbt7713";
  const isChinese = language !== "en";
  const basePrompt = resolveSectionPrompt(section, projectMode, { isGBT, isChinese });

  const resolvedSectionPrompt = subsectionTitle
    ? `请针对「${subsectionTitle}」这一子节进行扩写。只写这一小节的内容，不要扩写到该章节的其他子节。` +
      basePrompt.replace(/请(撰写|描述|总结)/, "请针对该子节$1")
    : basePrompt;

  const globalReferenceInfo = globalContext
    ? `
【论文全局背景（保持一致性参考）】分析：
- 摘要概览：${globalContext.abstract || "尚未撰写"}
- 论文大纲：${globalContext.outline || "尚未确定"}
- 其他章节进度：${Object.entries(globalContext.sectionPreviews || {})
        .map(([s, p]) => `[${s}]: ${p}`)
        .join("; ")}
    - 实验数据分析：${Array.isArray(globalContext?.analysisResults)
        ? globalContext.analysisResults.slice(0, 3).map((r: string) => r.slice(0, 300)).join("\n")
        : "暂无"}
`
    : "";

  const domainExpertise = buildDomainExpertise(researchDirection);

  const systemPrompt = buildWriterSystemPrompt({
    section,
    domainExpertise,
    globalReferenceInfo,
    template,
    language,
    contextText: contextText + refRangeHint,
    sectionInstruction: resolvedSectionPrompt,
    figureStart: typeof figureStart === "number" ? figureStart : 1,
    evidenceSummary,
    projectMode,
    sectionNumber:
      getSectionNumberForMode(section, projectMode) ??
      getTemplateSectionNumber(template || "sci", section, projectMode),
    citationStyle: typeof citationStyle === "string" ? citationStyle : "gbt7714",
  });

  return {
    systemPrompt,
    resolvedSectionPrompt,
    contextText,
    refRangeHint,
    refMapping,
    referencesByIndex,
    newSources,
    evidenceSummary,
    globalReferenceInfo,
    refCount,
    dataClaimCount,
  };
}

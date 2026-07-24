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
import { formatBlueprintGlobalSummary } from "@/lib/blueprint-utils";
import type { WritingPipelineEmit, PreparedWritingContext, WritingGlobalContext } from "./types";
import { buildAbstractSourceBody } from "@/lib/abstract-utils";

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

  const isAbstract = section === "abstract";
  emit({ type: "status", status: "retrieving" });
  emit({
    type: "pipeline_step",
    step: "retrieving",
    status: "running",
    detail: isAbstract ? "摘要基于全文提炼，跳过文献检索…" : "正在检索相关文献...",
  });

  // 检索超时保护：60 秒（全库 10 个分类索引加载需要约 30-40 秒）
  const RETRIEVAL_TIMEOUT_MS = 60_000;
  let contextText = "";
  let refMapping: Record<string, number> = {};
  let referencesByIndex: string[] = [];
  let newSources: string[] = [];
  let refRangeHint = "";
  let groundedRefIndices: number[] = [];

  if (isAbstract) {
    // 摘要一般无引用：不跑 RAG，避免模型被文献库诱导打 [n]
    contextText = "";
    emit({ type: "info", info: "摘要写作不检索文献库（摘要通常不放文内引用）" });
  } else {
    try {
      const result = await Promise.race([
        retrieveWritingContext(
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
            selectedSourceIds: data.selectedSourceIds,
          },
          existingReferences,
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException("检索超时", "TimeoutError")), RETRIEVAL_TIMEOUT_MS)
        ),
      ]);
      contextText = result.contextText;
      refMapping = result.refMapping;
      referencesByIndex = result.referencesByIndex;
      newSources = result.newSources;
      refRangeHint = result.refRangeHint;
      groundedRefIndices = result.groundedRefIndices;
      if (result.expandedToFullLibrary) {
        if (result.groundedRefIndices.length === 0) {
          emit({
            type: "info",
            info: "已扩大到全库检索，但勾选/过滤后仍无可用全文片段；请调整勾选文献或扩写要点后重试",
          });
        } else {
          emit({ type: "info", info: "分类范围检索无命中，已自动扩大到全库" });
        }
      } else if (
        result.groundedRefIndices.length === 0 &&
        data.selectedSourceIds !== undefined &&
        data.selectedSourceIds.length > 0
      ) {
        emit({
          type: "info",
          info: "勾选文献中未检索到匹配片段，正文将不带文献引用编号",
        });
      }
      if (result.topicFiltered && !result.topicSoftKept) {
        emit({ type: "info", info: "已按题目主题过滤跑题文献片段" });
      } else if (result.topicSoftKept) {
        emit({
          type: "info",
          info: "主题强相关文献较少，已保留检索得分较高的片段；建议补充更贴题的知识库文献",
        });
      }
    } catch (e: unknown) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      emit({ type: "info", info: isTimeout
        ? "文献检索超时，使用基础上下文继续写作"
        : `文献检索失败，使用基础上下文继续写作` });
      contextText = `${title}\n${context || ""}`;
      // 失败时保持 groundedRefIndices=[] → sanitize 去掉全部 [n]
    }
  }

  const refCount = referencesByIndex.length;
  const dataClaimCount = dataClaims.length;
  emit({
    type: "pipeline_step",
    step: "retrieving",
    status: "done",
    detail: `找到 ${refCount} 条可引用文献`,
  });
  if (Object.keys(refMapping).length > 0) {
    emit({ type: "info", info: "", refMapping });
  }
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

  const abstractBody =
    isAbstract
      ? buildAbstractSourceBody(globalContext?.sectionBodies) ||
        buildAbstractSourceBody(globalContext?.sectionPreviews)
      : "";

  const globalReferenceInfo = isAbstract
    ? `
【摘要写作说明】摘要应在正文基本完成后撰写，综合下列全文提炼，不要使用 [n] 引用。
【论文大纲】
${globalContext?.outline || "尚未确定"}
【已完成正文（请据此撰写摘要）】
${abstractBody || "（正文尚未提供。请仅根据题目与大纲做高度概括，并避免编造具体数据。）"}
${Array.isArray(globalContext?.analysisResults) && globalContext.analysisResults.length > 0
  ? `\n【实验数据分析摘要】\n${globalContext.analysisResults.slice(0, 3).map((r: string) => r.slice(0, 400)).join("\n")}`
  : ""}
`
    : globalContext
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
${globalContext.blueprint ? `\n【写作蓝图摘要】\n${formatBlueprintGlobalSummary(globalContext.blueprint)}\n` : ""}`
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
    groundedRefIndices,
  };
}

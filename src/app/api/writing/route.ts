import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import type { WritingSSEEvent } from "@/contracts/sse";
import type { EvidenceClaim } from "@/contracts/data-source";
import { localRAG } from "@/lib/rag";
import { retrieveWritingContext } from "@/services/writing-context";
import { collectCitationFirstAppearance, collectInvalidCitationNumbers, stripOutOfRangeCitations } from "@/lib/reference-reorder";
import { normalizeAllCitationFormats } from "@/lib/citation-bounds";
import { validateCitations, validateDataClaims } from "@/lib/citation-validator";
import { buildEvidencePack } from "@/services/evidence-pack";
import { callAI, callAINonStreaming, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import {
  buildDomainExpertise,
  WRITING_SECTION_PROMPTS,
  buildWriterSystemPrompt,
  buildVerifierSystemPrompt,
  buildVerifierPrompt,
  buildRefinerSystemPrompt,
  buildRefinerPrompt,
} from "@/lib/prompts";
import { validateBody } from "@/lib/api-validate";
import { writingSchema } from "@/lib/validations";
import { getTemplateSectionNumber } from "@/lib/template-sections";

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id") || undefined;
    const { data, errorResponse: ve } = await validateBody(writingSchema, await req.json());
    if (ve) return ve;

    const {
      title,
      section,
      context,
      language,
      template,
      existingReferences = [],
      globalContext: rawGlobalContext,
      mode,
      verificationFeedback: manualFeedback,
      retrievalMode,
      researchDirection,
      subsectionTitle,
      figureStart,
      evidenceSummary: manualEvidenceSummary,
      projectMode,
      dataClaims: rawDataClaims,
      citationStyle,
    } = data;

    const dataClaims = (rawDataClaims ?? []) as EvidenceClaim[];
    // globalContext 来自前端的项目快照对象，包含 abstract/outline/sectionPreviews/analysisResults
    const globalContext = rawGlobalContext as {
      abstract?: string;
      outline?: string;
      sectionPreviews?: Record<string, string>;
      analysisResults?: string[];
    } | undefined;

    if (!context) {
      return new Response(
        JSON.stringify({ error: "Missing required field: context" }),
        { status: 400 },
      );
    }

    // 验证各 agent 的 key 配置
    for (const role of ["writer", "verifier", "refiner"] as const) {
      const { keyError } = getAgentModelConfig(role);
      if (keyError) {
        if (role === "writer") {
          return new Response(JSON.stringify({ error: keyError }), { status: 500 });
        }
      }
    }

    // Stream 立即创建，所有耗时工作移入 start() 内部
    // 确保 HTTP 响应头立刻发送，前端马上看到进度而非白屏等待
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: WritingSSEEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          let initialDraft = context;
          let finalDraft = context;

          // ====== 阶段 0：RAG 检索 + 证据整理（流内执行，实时反馈） ======
          emit({ type: "status", status: "retrieving" });
          emit({ type: "pipeline_step", step: "retrieving", status: "running", detail: "正在检索相关文献..." });

          const { contextText, refMapping, referencesByIndex, newSources, refRangeHint } =
            await retrieveWritingContext(
              { title, section, context, language, template: template || "sci", existingReferences, researchDirection, retrievalMode },
              existingReferences,
            );

          const refCount = referencesByIndex.length;
          const dataClaimCount = (dataClaims as unknown[]).length;
          emit({ type: "pipeline_step", step: "retrieving", status: "done", detail: `找到 ${refCount} 条可引用文献` });
          await new Promise(r => setTimeout(r, 40));

          emit({ type: "pipeline_step", step: "building_context", status: "running", detail: "正在整理证据包..." });
          const evidencePack = buildEvidencePack({
            mode: projectMode || "review",
            existingReferences,
            dataClaims: dataClaims as EvidenceClaim[],
            ragChunks: [],
            formatRagCitation: undefined,
          });
          const evidenceSummary = manualEvidenceSummary || evidencePack.summary;
          emit({ type: "pipeline_step", step: "building_context", status: "done", detail: `引用范围 [1]-[${refCount || 0}]${dataClaimCount > 0 ? `，数据证据 ${dataClaimCount} 条` : ""}` });
          await new Promise(r => setTimeout(r, 40));

          // ====== 构建 System Prompt（快速，无需额外 emit） ======
          const isGBT = template === "gbt7713";
          const isChinese = language !== "en";
          const sectionInstruction = WRITING_SECTION_PROMPTS[section];
          const basePrompt =
            typeof sectionInstruction === "function"
              ? (sectionInstruction as (params: { isGBT: boolean; isChinese: boolean }) => string)({ isGBT, isChinese })
              : sectionInstruction || "请根据以上信息进行专业扩写。";

          const resolvedSectionPrompt = subsectionTitle
            ? `请针对「${subsectionTitle}」这一子节进行扩写。只写这一小节的内容，不要扩写到该章节的其他子节。` + basePrompt.replace(/请(撰写|描述|总结)/, "请针对该子节$1")
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
            sectionNumber: getTemplateSectionNumber(template || "sci", section),
            citationStyle: typeof citationStyle === "string" ? citationStyle : "gbt7714",
          });

          // ====== 阶段 1：模式路由 ======

          // --- 模式: audit_only ---
          if (mode === "audit_only") {
            emit({ type: "status", status: "verifying" });
            const prompt = buildVerifierPrompt({ contextText, content: context });

            const response = await callAI({
              userId, provider: getAgentModelConfig("verifier").provider,
              messages: [
                { role: "system", content: buildVerifierSystemPrompt("audit") },
                { role: "user", content: prompt },
              ],
            });

            for await (const chunk of streamAIResponse(response)) {
              if (chunk.content) {
                emit({ type: "verification", verification: chunk.content });
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // --- 模式: fix_only ---
          if (mode === "fix_only" && manualFeedback) {
            emit({ type: "status", status: "refining" });
            const prompt = buildRefinerPrompt({
              contextText,
              feedback: manualFeedback,
              content: context,
              isFixOnly: true,
            });

            const response = await callAI({
              userId, provider: getAgentModelConfig("refiner").provider,
              messages: [
                { role: "system", content: buildRefinerSystemPrompt() },
                { role: "user", content: prompt },
              ],
            });

            for await (const chunk of streamAIResponse(response)) {
              if (chunk.content) {
                emit({ type: "delta", content: chunk.content });
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // ====== 阶段 2：Writer（流式生成） ======
          // req.signal: 客户端断开时自动 abort；300s 总超时由 fetchWithRetry 保证
          emit({ type: "status", status: "writing" });
          emit({ type: "pipeline_step", step: "writing", status: "running", detail: "AI 正在生成初稿..." });

          const writerResponse = await callAI({
            provider: getAgentModelConfig("writer").provider,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `论文题目：${title}\n当前写作章节：${section}\n研究内容/上下文信息：${context}\n\n指令：${resolvedSectionPrompt}`,
              },
            ],
            signal: req.signal,
            timeoutMs: 300_000,
          });

          if (!writerResponse.ok || !writerResponse.body) throw new Error("Writer 代理调用失败");

          initialDraft = "";
          finalDraft = "";
          for await (const chunk of streamAIResponse(writerResponse, req.signal)) {
            if (chunk.content) {
              initialDraft += chunk.content;
              finalDraft += chunk.content;
              emit({ type: "delta", content: chunk.content });
            }
          }

          // 快速模式：只跑 Writer，跳过 Verifier 和 Refiner
          if (mode === "fast") {
            emit({ type: "pipeline_step", step: "writing", status: "done", detail: `初稿 ${initialDraft.length} 字` });
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          emit({ type: "pipeline_step", step: "writing", status: "done", detail: `初稿 ${initialDraft.length} 字` });
          await new Promise(r => setTimeout(r, 60));

          // ====== 阶段 3：Verifier（流式核查，实时展示进度） ======
          emit({ type: "status", status: "verifying" });

          // 收集被引用文献的完整原文 chunk（最多前 5 篇全文，其余仅摘要）
          const citedIndices = collectCitationFirstAppearance(
            initialDraft,
            referencesByIndex.length,
          );
          const MAX_FULL_SOURCES = 5;
          const fullSourceChunks: string[] = [];
          let sourceIdx = 0;
          for (const idx of citedIndices) {
            const sourceName = referencesByIndex[idx - 1];
            if (!sourceName) continue;
            const fullText = await localRAG.getFullText(sourceName);
            if (!fullText) continue;
            sourceIdx++;
            if (sourceIdx <= MAX_FULL_SOURCES) {
              const trimmed = fullText.length > 2000
                ? fullText.slice(0, 1000) + "\n…[省略]…\n" + fullText.slice(-1000)
                : fullText;
              fullSourceChunks.push(`=== [${idx}] ${sourceName} 全文 ===\n${trimmed}`);
            } else {
              fullSourceChunks.push(`=== [${idx}] ${sourceName} 摘要 ===\n${fullText.slice(0, 300)}…`);
            }
          }

          const verifierPrompt = buildVerifierPrompt({
            contextText,
            content: initialDraft,
            globalReferenceInfo,
            fullSourceTexts: fullSourceChunks.length > 0 ? fullSourceChunks.join("\n\n") : undefined,
          });

          let verificationReport = "";
          const { provider: verifierProvider, keyError: verifierKeyError } =
            getAgentModelConfig("verifier");

          const actualVerifierProvider = verifierKeyError ? "deepseek" : verifierProvider;

          if (actualVerifierProvider !== getAgentModelConfig("writer").provider) {
            emit({ type: "info", info: `使用 ${actualVerifierProvider === "zhipu" ? "智谱AI" : "DeepSeek"} 进行独立验证` });
          }

          emit({ type: "pipeline_step", step: "verifying", status: "running", detail: "独立 AI 正在核查引用真实性..." });

          try {
            const verifierResponse = await callAI({
              userId, provider: actualVerifierProvider,
              messages: [
                { role: "system", content: buildVerifierSystemPrompt("full") },
                { role: "user", content: verifierPrompt },
              ],
              signal: req.signal,
              timeoutMs: 60_000,
            });

            if (verifierResponse.ok && verifierResponse.body) {
              for await (const chunk of streamAIResponse(verifierResponse, req.signal)) {
                if (chunk.content) {
                  verificationReport += chunk.content;
                  emit({ type: "verification", verification: chunk.content });
                }
              }
            }
          } catch (e: unknown) {
            const reason = e instanceof DOMException && e.name === "AbortError" ? "核查超时" : "核查失败";
            verificationReport = `核查请求${reason}，跳过自动审查。`;
            emit({ type: "verification", verification: verificationReport });
          }

          const failedVerificationIssues = verificationReport && !verificationReport.trim().toUpperCase().startsWith("PASS") && verificationReport.length > 20;
          emit({ type: "pipeline_step", step: "verifying", status: "done", detail: failedVerificationIssues ? "发现问题" : "核查通过" });

          await new Promise(r => setTimeout(r, 40));

          // ====== 阶段 4：Refiner（根据核查报告修正，修正后的文本再送引用核查） ======
          const maxRefIndex = referencesByIndex.length;

          // 先归一化所有非标准引用格式，再清理越界
          const normalizedDraft = normalizeAllCitationFormats(finalDraft || initialDraft);
          const correctedDraft = stripOutOfRangeCitations(normalizedDraft, maxRefIndex);
          if (correctedDraft !== (finalDraft || initialDraft)) {
            emit({ type: "corrected_text", text: correctedDraft });
          }

          // 检测过滤后仍残留的越界引用（正则盲区：非常见标点等），上报前端
          const lingeringInvalid = collectInvalidCitationNumbers(correctedDraft, maxRefIndex);
          if (lingeringInvalid.length > 0) {
            emit({ type: "info", info: `检测到 ${lingeringInvalid.length} 处越界引用 [${lingeringInvalid.join(", ")}]，已替换为占位标记。请检查修正后的文本。` });
          }

          let refinedDraft = correctedDraft;
          if (failedVerificationIssues && verificationReport) {
            emit({ type: "status", status: "refining" });
            emit({ type: "pipeline_step", step: "refining", status: "running", detail: "主编根据审稿意见修正中..." });

            // 清空前端的 Writer 输出，Refiner 将输出干净修正文本替代
            emit({ type: "clear_result" });

            try {
              const refinerPrompt = buildRefinerPrompt({
                contextText,
                feedback: verificationReport,
                content: correctedDraft,
                isFixOnly: false,
              });

              // 非流式调用：等待完整修正文本，一次返回，彻底避免流挂起
              const correctedText = await callAINonStreaming({ userId,
                provider: getAgentModelConfig("refiner").provider,
                messages: [
                  { role: "system", content: buildRefinerSystemPrompt() },
                  { role: "user", content: refinerPrompt },
                ],
                signal: req.signal,
                timeoutMs: 90_000,
              });

              if (correctedText && correctedText.trim().length > 10) {
                refinedDraft = stripOutOfRangeCitations(normalizeAllCitationFormats(correctedText.trim()), maxRefIndex);
                // 用 corrected_text 事件一次性替换前端内容
                emit({ type: "corrected_text", text: refinedDraft });
                emit({ type: "pipeline_step", step: "refining", status: "done", detail: "已修正" });
              } else {
                emit({ type: "pipeline_step", step: "refining", status: "done", detail: "修正返回为空，保留原稿" });
              }
            } catch (e: unknown) {
              const reason = e instanceof DOMException && e.name === "AbortError" ? "修正超时" : `修正失败: ${e instanceof Error ? e.message : "未知错误"}`;
              emit({ type: "pipeline_step", step: "refining", status: "done", detail: reason });
              // 修正失败时保留原稿，继续后续核查
            }
          } else {
            emit({ type: "pipeline_step", step: "refining", status: "done", detail: verificationReport ? "核查通过，无需修正" : "无核查意见" });
          }

          await new Promise(r => setTimeout(r, 40));

          // Refiner 后再次检测越界引用（Refiner 可能重新引入）
          const lingeringAfterRefine = collectInvalidCitationNumbers(refinedDraft, maxRefIndex);
          if (lingeringAfterRefine.length > 0) {
            emit({ type: "info", info: `修正后发现 ${lingeringAfterRefine.length} 处越界引用 [${lingeringAfterRefine.join(", ")}]，已处理。` });
          }

          // ====== 阶段 5：引用校验 & 数据核查（基于修正后文本） ======
          emit({ type: "pipeline_step", step: "checking_citations", status: "running", detail: "正在校验引用真实性..." });

          const checkTarget = refinedDraft || correctedDraft;
          const usedCitationIndexes = collectCitationFirstAppearance(checkTarget, maxRefIndex);
          const usedNewSources = usedCitationIndexes
            .map((idx) => referencesByIndex[idx - 1])
            .filter((ref): ref is string => Boolean(ref) && newSources.includes(ref));

          if (usedNewSources.length > 0) {
            emit({ type: "references", references: Array.from(new Set(usedNewSources)), refMapping });
          } else if (Object.keys(refMapping).length > 0) {
            // 无新引用源，单独发送 refMapping（不影响 references 流程）
            emit({ type: "info", info: "", refMapping });
          }

          const citationChecks = validateCitations(checkTarget, contextText);
          const failedChecks = citationChecks.filter((c) => !c.passed);
          if (failedChecks.length > 0) {
            emit({ type: "citation_warnings", warnings: failedChecks.map((c) => ({ num: c.number, overlap: Math.round(c.overlap * 100), context: c.citedSentence.length > 120 ? c.citedSentence.slice(0, 120) + "..." : c.citedSentence })) });
          }

          // 数据证据核实
          if (dataClaims.length > 0) {
            const dataChecks = validateDataClaims(checkTarget, dataClaims as EvidenceClaim[]);
            const failedDataChecks = dataChecks.filter((c) => !c.found || !c.citedCorrectly);
            if (failedDataChecks.length > 0) {
              emit({ type: "data_claim_warnings", warnings: failedDataChecks });
              emit({ type: "pipeline_step", step: "checking_data", status: "done", detail: `${failedDataChecks.length} 条数据证据异常` });
            } else {
              emit({ type: "pipeline_step", step: "checking_data", status: "done", detail: "数据证据核查通过" });
            }
          }

          const citFailedCount = failedChecks.length;
          const newRefCount = usedNewSources.length;
          emit({ type: "pipeline_step", step: "checking_citations", status: "done", detail: `${citFailedCount > 0 ? `发现 ${citFailedCount} 条引用风险` : "引用校验通过"}${newRefCount > 0 ? `，已追加 ${newRefCount} 条参考文献` : ""}` });

          emit({ type: "status", status: "completed" });
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: any) {
          logger.error("MAV Pipeline Error:", error);
          try { emit({ type: "error", error: error.message }); } catch {}
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    logger.error("Writing Expansion Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
    });
  }
}

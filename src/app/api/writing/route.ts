import { NextRequest } from "next/server";
import { formatRagCitation, localRAG } from "@/lib/rag";
import { collectCitationFirstAppearance } from "@/lib/reference-reorder";
import { validateCitations } from "@/lib/citation-validator";
import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import {
  buildDomainExpertise,
  WRITING_SECTION_PROMPTS,
  buildWriterSystemPrompt,
  buildVerifierSystemPrompt,
  buildVerifierPrompt,
  buildRefinerSystemPrompt,
  buildRefinerPrompt,
} from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const {
      title,
      section,
      context,
      language = "zh",
      template = "sci",
      existingReferences = [],
      globalContext,
      mode = "full",
      verificationFeedback: manualFeedback,
      retrievalMode = "balanced",
      researchDirection,
    } = await req.json();

    if (!title || !section || !context) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, section, or context" }),
        { status: 400 },
      );
    }

    // 验证各 agent 的 key 配置
    for (const role of ["writer", "verifier", "refiner"] as const) {
      const { keyError } = getAgentModelConfig(role);
      if (keyError) {
        // 如果 verifier/refiner key 未配置但没用上（如 audit_only 模式可能不需要），可以降级
        if (role === "writer") {
          return new Response(JSON.stringify({ error: keyError }), { status: 500 });
        }
      }
    }

    // 1. 根据召回精度模式设置检索参数
    const retrievalConfigs: Record<string, { limit: number; maxPerSource: number }> = {
      precise: { limit: 10, maxPerSource: 2 },
      balanced: { limit: 40, maxPerSource: 4 },
      extensive: { limit: 100, maxPerSource: 8 },
    };
    const { limit: ragLimit, maxPerSource: ragMaxPerSource } = retrievalConfigs[retrievalMode] || retrievalConfigs.balanced;

    // 2. RAG 检索
    const searchQuery = `${title} ${context}`;
    let contextChunks = await localRAG.search(searchQuery, { limit: ragLimit, maxPerSource: ragMaxPerSource });
    if (contextChunks.length === 0) {
      contextChunks = await localRAG.search(title, { limit: ragLimit, maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)) });
    }

    const refMapping: Record<string, number> = {};
    const newSources: string[] = [];
    const referencesByIndex: string[] = [];

    existingReferences.forEach((ref: string, i: number) => {
      refMapping[ref] = i + 1;
      referencesByIndex[i] = ref;
    });

    const contextText =
      contextChunks.length > 0
        ? contextChunks
            .map((c) => {
              const source = c.metadata.source;
              if (!source || source === "unknown") return c.content;

              let globalIndex: number;
              if (refMapping[source]) {
                globalIndex = refMapping[source];
              } else {
                globalIndex = Object.keys(refMapping).length + 1;
                refMapping[source] = globalIndex;
                referencesByIndex[globalIndex - 1] = source;
                newSources.push(source);
              }

              return `[参考来源 [${globalIndex}]: ${formatRagCitation(c)}]\n${c.content}`;
            })
            .join("\n\n")
        : "（未找到直接相关的文献参考，请根据通用学术知识扩写）";

    const isGBT = template === "gbt7713";
    const sectionInstruction = WRITING_SECTION_PROMPTS[section];
    const resolvedSectionPrompt =
      typeof sectionInstruction === "function"
        ? (sectionInstruction as (isGBT: boolean) => string)(isGBT)
        : sectionInstruction || "请根据以上信息进行专业扩写。";

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
      contextText,
      sectionInstruction: resolvedSectionPrompt,
    });

    // 2. 多代理工作流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let initialDraft = context;
          let finalDraft = context;

          // --- 模式: audit_only ---
          if (mode === "audit_only") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "verifying" })}\n\n`));
            const prompt = buildVerifierPrompt({ contextText, content: context });

            const response = await callAI({
              provider: getAgentModelConfig("verifier").provider,
              messages: [
                { role: "system", content: buildVerifierSystemPrompt("audit") },
                { role: "user", content: prompt },
              ],
            });

            for await (const chunk of streamAIResponse(response)) {
              if (chunk.content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ verification: chunk.content })}\n\n`),
                );
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // --- 模式: fix_only ---
          if (mode === "fix_only" && manualFeedback) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "refining" })}\n\n`));
            const prompt = buildRefinerPrompt({
              contextText,
              feedback: manualFeedback,
              content: context,
              isFixOnly: true,
            });

            const response = await callAI({
              provider: getAgentModelConfig("refiner").provider,
              messages: [
                { role: "system", content: buildRefinerSystemPrompt() },
                { role: "user", content: prompt },
              ],
            });

            for await (const chunk of streamAIResponse(response)) {
              if (chunk.content) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}\n\n`,
                  ),
                );
              }
            }
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // --- 模式: full (Writer -> Verifier -> Refiner) ---
          // Agent 1: Writer (使用 DeepSeek)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "writing" })}\n\n`));

          const writerResponse = await callAI({
            provider: getAgentModelConfig("writer").provider,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `论文题目：${title}\n当前写作章节：${section}\n研究内容/上下文信息：${context}\n\n指令：${resolvedSectionPrompt}`,
              },
            ],
          });

          if (!writerResponse.ok || !writerResponse.body) throw new Error("Writer 代理调用失败");

          initialDraft = "";
          finalDraft = "";
          for await (const chunk of streamAIResponse(writerResponse)) {
            if (chunk.content) {
              initialDraft += chunk.content;
              finalDraft += chunk.content;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}\n\n`,
                ),
              );
            }
          }

          // Agent 2: Verifier (使用智谱AI，独立验证)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "verifying" })}\n\n`));

          const verifierPrompt = buildVerifierPrompt({
            contextText,
            content: initialDraft,
            globalReferenceInfo,
          });

          let verificationReport = "";
          const { provider: verifierProvider, keyError: verifierKeyError } =
            getAgentModelConfig("verifier");

          // 如果 verifier 的 key 没配，降级为 deepseek
          const actualVerifierProvider = verifierKeyError ? "deepseek" : verifierProvider;

          if (actualVerifierProvider !== getAgentModelConfig("writer").provider) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ info: `使用 ${actualVerifierProvider === "zhipu" ? "智谱AI" : "DeepSeek"} 进行独立验证` })}\n\n`,
              ),
            );
          }

          const verifierResponse = await callAI({
            provider: actualVerifierProvider,
            messages: [
              { role: "system", content: buildVerifierSystemPrompt("full") },
              { role: "user", content: verifierPrompt },
            ],
          });

          if (verifierResponse.ok && verifierResponse.body) {
            for await (const chunk of streamAIResponse(verifierResponse)) {
              if (chunk.content) {
                verificationReport += chunk.content;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ verification: chunk.content })}\n\n`,
                  ),
                );
              }
            }
          }

          // Agent 3: Refiner (条件触发)
          if (verificationReport && !verificationReport.includes("PASS") && verificationReport.length > 10) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "refining" })}\n\n`));

            const refinerPrompt = buildRefinerPrompt({
              contextText,
              feedback: verificationReport,
              content: initialDraft,
            });

            const refinerResponse = await callAI({
              provider: getAgentModelConfig("refiner").provider,
              messages: [
                { role: "system", content: buildRefinerSystemPrompt() },
                { role: "user", content: refinerPrompt },
              ],
            });

            if (refinerResponse.ok && refinerResponse.body) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ action: "clear_result" })}\n\n`),
              );
              finalDraft = "";

              for await (const chunk of streamAIResponse(refinerResponse)) {
                if (chunk.content) {
                  finalDraft += chunk.content;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ choices: [{ delta: { content: chunk.content } }] })}\n\n`,
                    ),
                  );
                }
              }
            }
          }

          // 后处理：引用收集 + 校验
          const usedCitationIndexes = collectCitationFirstAppearance(
            finalDraft || initialDraft,
            referencesByIndex.length,
          );
          const usedNewSources = usedCitationIndexes
            .map((idx) => referencesByIndex[idx - 1])
            .filter((ref): ref is string => Boolean(ref) && newSources.includes(ref));

          if (usedNewSources.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ references: Array.from(new Set(usedNewSources)) })}\n\n`,
              ),
            );
          }

          const citationChecks = validateCitations(finalDraft || initialDraft, contextText);
          const failedChecks = citationChecks.filter((c) => !c.passed);
          if (failedChecks.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  citation_warnings: failedChecks.map((c) => ({
                    num: c.number,
                    overlap: Math.round(c.overlap * 100),
                    context:
                      c.citedSentence.length > 120
                        ? c.citedSentence.slice(0, 120) + "..."
                        : c.citedSentence,
                  })),
                })}\n\n`,
              ),
            );
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: any) {
          console.error("MAV Pipeline Error:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`),
          );
          controller.close();
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
    console.error("Writing Expansion Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
    });
  }
}

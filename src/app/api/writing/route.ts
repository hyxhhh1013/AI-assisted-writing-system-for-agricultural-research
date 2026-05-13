import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
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

const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");

function matchCategory(direction: string): string | null {
  if (!direction || !fs.existsSync(METADATA_PATH)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as {
      category: string;
    }[];
    const categories = Array.from(new Set(metadata.map((m) => m.category))).filter(
      (c) => c && c !== "未分类",
    );
    if (categories.length === 0) return null;
    const kw = direction.toLowerCase();
    const matches = categories
      .map((cat) => ({
        cat,
        score: cat.split(/[\s\-_]/).filter((w) => kw.includes(w.toLowerCase())).length,
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return matches[0]?.cat || null;
  } catch {
    return null;
  }
}

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
      subsectionTitle,
      figureStart,
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
      balanced: { limit: 20, maxPerSource: 3 },
      extensive: { limit: 60, maxPerSource: 6 },
    };
    const { limit: ragLimit, maxPerSource: ragMaxPerSource } = retrievalConfigs[retrievalMode] || retrievalConfigs.balanced;

    // 2. RAG 检索
    const searchQuery = `${title} ${context}`;
    // 按章节类型注入检索关键词，提升文献相关性
    const sectionKeywords: Record<string, string> = {
      abstract: "综述 研究背景 研究目的 主要结果 结论",
      introduction: "研究背景 综述 研究现状 存在问题 研究进展",
      methods: "实验方法 制备 表征 测试 合成 优化",
      results: "实验数据 结果分析 性能对比 机理 影响因素",
      conclusion: "结论 展望 应用前景 创新点 贡献",
    };
    const sectionBoost = sectionKeywords[section] || "";
    // 将用户研究方向注入检索 query，提升多方向文献库中的检索准确性
    const directionBoost = researchDirection || "";
    const enhancedQuery = [sectionBoost, directionBoost, title, context]
      .filter(Boolean)
      .join(" ");
    const matchedCategory = matchCategory(researchDirection || "");

    let contextChunks = await localRAG.search(enhancedQuery, {
      limit: ragLimit,
      maxPerSource: ragMaxPerSource,
      category: matchedCategory || undefined,
    });
    if (contextChunks.length === 0) {
      // 降级：只用 title + sectionBoost + direction 重试
      const fallbackQuery = [sectionBoost, directionBoost, title]
        .filter(Boolean)
        .join(" ");
      contextChunks = await localRAG.search(fallbackQuery, {
        limit: ragLimit,
        maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)),
        category: matchedCategory || undefined,
      });
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

              // 清理原文中的引用标记，避免 AI 误将其当作可引用的编号
              const cleanedContent = c.content.replace(/\[(\d+[\d,\s\-–—]*)\]/g, "[文献$1]");
              return `[参考来源 [${globalIndex}]: ${formatRagCitation(c)}]\n${cleanedContent}`;
            })
            .join("\n\n")
        : "（未找到直接相关的文献参考，请根据通用学术知识扩写）";

    const isGBT = template === "gbt7713";
    const sectionInstruction = WRITING_SECTION_PROMPTS[section];
    const basePrompt =
      typeof sectionInstruction === "function"
        ? (sectionInstruction as (isGBT: boolean) => string)(isGBT)
        : sectionInstruction || "请根据以上信息进行专业扩写。";

    // 子任务扩写：聚焦到具体子节，而非整个章节
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
      contextText,
      sectionInstruction: resolvedSectionPrompt,
      figureStart: typeof figureStart === "number" ? figureStart : 1,
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

          // 快速模式：只跑 Writer，跳过 Verifier 和 Refiner
          if (mode === "fast") {
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // Agent 2: Verifier (使用智谱AI，独立验证)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "verifying" })}\n\n`));

          // 为 Verifier 收集被引用文献的完整原文 chunk
          const citedIndices = collectCitationFirstAppearance(
            initialDraft,
            referencesByIndex.length,
          );
          const fullSourceChunks: string[] = [];
          for (const idx of citedIndices) {
            const sourceName = referencesByIndex[idx - 1];
            if (!sourceName) continue;
            const fullText = localRAG.getFullText(sourceName);
            if (fullText) {
              // 如果全文太长（>3000字），取前后各 1500 字
              const trimmed = fullText.length > 3000
                ? fullText.slice(0, 1500) + "\n…[省略中间部分]…\n" + fullText.slice(-1500)
                : fullText;
              fullSourceChunks.push(`=== [${idx}] ${sourceName} 完整原文 ===\n${trimmed}`);
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

          // Agent 3: Refiner (条件触发 — 仅当核查发现实际问题时）
          const isPass = verificationReport.trim().toUpperCase().startsWith("PASS");
          if (verificationReport && !isPass && verificationReport.length > 20) {
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

          // 后处理：过滤超范围引用 + 发送修正后文本给前端
          const maxRefIndex = referencesByIndex.length;
          const correctedDraft = (finalDraft || initialDraft).replace(
            /\[(\d+)\]/g,
            (_match: string, num: string) => {
              const n = parseInt(num, 10);
              return n >= 1 && n <= maxRefIndex ? _match : `[文献${n}]`;
            }
          );
          if (correctedDraft !== (finalDraft || initialDraft)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ corrected_text: correctedDraft })}\n\n`)
            );
          }

          // 后处理：引用收集 + 校验
          const usedCitationIndexes = collectCitationFirstAppearance(
            correctedDraft,
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

          const citationChecks = validateCitations(correctedDraft, contextText);
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

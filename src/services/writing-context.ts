/** 写作上下文构建 — 从 writing/route.ts 提取的 RAG + prompt 逻辑 */

import fs from "fs";
import path from "path";
import { localRAG, formatRagCitation, cleanSourceName } from "@/lib/rag";
import type { WritingRequest } from "@/contracts/writing";

const METADATA_PATH = path.join(process.cwd(), "data", "metadata.json");

function matchCategory(direction: string): string | null {
  if (!direction || !fs.existsSync(METADATA_PATH)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as { category: string }[];
    const categories = Array.from(new Set(metadata.map((m) => m.category))).filter(c => c && c !== "未分类");
    if (categories.length === 0) return null;
    const kw = direction.toLowerCase();
    const matches = categories
      .map(cat => ({ cat, score: cat.split(/[\s\-_]/).filter(w => kw.includes(w.toLowerCase())).length }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return matches[0]?.cat || null;
  } catch {
    return null;
  }
}

export interface WritingContext {
  contextText: string;
  refMapping: Record<string, number>;
  referencesByIndex: string[];
  newSources: string[];
  ragLimit: number;
  ragMaxPerSource: number;
  refRangeHint: string;
}

const sectionKeywords: Record<string, string> = {
  abstract: "综述 研究背景 研究目的 主要结果 结论",
  introduction: "研究背景 综述 研究现状 存在问题 研究进展",
  methods: "实验方法 制备 表征 测试 合成 优化",
  results: "实验数据 结果分析 性能对比 机理 影响因素",
  conclusion: "结论 展望 应用前景 创新点 贡献",
};

const retrievalConfigs: Record<string, { limit: number; maxPerSource: number }> = {
  precise: { limit: 10, maxPerSource: 2 },
  balanced: { limit: 20, maxPerSource: 3 },
  extensive: { limit: 60, maxPerSource: 6 },
};

export async function retrieveWritingContext(
  params: WritingRequest,
  existingReferences: string[],
): Promise<WritingContext> {
  const { title, section, context, researchDirection, retrievalMode = "balanced" } = params;
  const { limit: ragLimit, maxPerSource: ragMaxPerSource } = retrievalConfigs[retrievalMode] || retrievalConfigs.balanced;

  // RAG 检索
  const sectionBoost = sectionKeywords[section] || "";
  const directionBoost = researchDirection || "";
  const enhancedQuery = [sectionBoost, directionBoost, title, context].filter(Boolean).join(" ");
  const matchedCategory = matchCategory(researchDirection || "");

  let contextChunks = await localRAG.search(enhancedQuery, {
    limit: ragLimit,
    maxPerSource: ragMaxPerSource,
    category: matchedCategory || undefined,
  });
  if (contextChunks.length === 0) {
    const fallbackQuery = [sectionBoost, directionBoost, title].filter(Boolean).join(" ");
    contextChunks = await localRAG.search(fallbackQuery, {
      limit: ragLimit,
      maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)),
      category: matchedCategory || undefined,
    });
  }

  // 构建引用映射
  const refMapping: Record<string, number> = {};
  const referencesByIndex: string[] = [];
  const newSources: string[] = [];
  existingReferences.forEach((ref: string, i: number) => {
    refMapping[ref] = i + 1;
    referencesByIndex[i] = ref;
  });

  const contextText = contextChunks.length > 0
    ? contextChunks.map((c) => {
        const rawSource = c.metadata.source;
        if (!rawSource || rawSource === "unknown") return c.content;
        const source = cleanSourceName(rawSource);
        let globalIndex: number;
        if (refMapping[source]) {
          globalIndex = refMapping[source];
        } else {
          globalIndex = Object.keys(refMapping).length + 1;
          refMapping[source] = globalIndex;
          referencesByIndex[globalIndex - 1] = source;
          newSources.push(source);
        }
        const cleanedContent = c.content.replace(/\[(\d+[\d,\s\-–—，、]*)\]/g, "[文献$1]");
        return `[参考来源 [${globalIndex}]: ${formatRagCitation(c)}]\n${cleanedContent}`;
      }).join("\n\n")
    : "（未找到直接相关的文献参考，请根据通用学术知识扩写）";

  const totalRefs = referencesByIndex.length;
  const refRangeHint = totalRefs > 0
    ? `\n⚠️ 可用参考文献共 ${totalRefs} 篇，编号 [1] 到 [${totalRefs}]。严禁使用超出此范围的引用编号！`
    : "";

  return { contextText, refMapping, referencesByIndex, newSources, ragLimit, ragMaxPerSource, refRangeHint };
}

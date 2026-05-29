/**
 * 降重改写 Service
 *
 * 改进点：
 * - 4 种策略使用独立 prompt（差异化指令）
 * - 并行调用 AI（Promise.all）
 * - 改写后长度校验
 * - 输出清理（Markdown 包裹、前缀说明）
 * - 持久化失败时记录日志
 */

import prisma from "@/lib/prisma";
import { callAI } from "@/lib/ai";
import { buildRewritePrompt, cleanRewriteOutput } from "@/lib/prompts/rewrite";
import { extractNGrams, jaccardSimilarity } from "@/lib/similarity";

export type RewriteStrategy = "synonym" | "rephrase" | "summarize" | "expand";

interface RewriteOptions {
  checkId: string;
  matchId?: string;
  originalText: string;
  contextText?: string;
  researchDirection?: string;
}

export interface RewriteResult {
  strategy: RewriteStrategy;
  suggestedText: string;
  similarityBefore: number;
  similarityAfter: number;
  lengthRatio: number;
}

const STRATEGY_LABELS: Record<RewriteStrategy, string> = {
  synonym: "同义替换",
  rephrase: "改写语序",
  summarize: "概括精简",
  expand: "扩写重组",
};

// ==================== 相似度计算 ====================

function calcTextSimilarity(a: string, b: string): number {
  const ca = a.replace(/\s+/g, "");
  const cb = b.replace(/\s+/g, "");
  if (ca.length < 5 || cb.length < 5) return 0;
  const sim4 = jaccardSimilarity(extractNGrams(ca, 4), extractNGrams(cb, 4));
  const sim3 = jaccardSimilarity(extractNGrams(ca, 3), extractNGrams(cb, 3));
  return sim4 * 0.6 + sim3 * 0.4;
}

// ==================== 单策略改写 ====================

async function rewriteWithStrategy(
  strategy: RewriteStrategy,
  options: RewriteOptions
): Promise<RewriteResult> {
  const { system, user } = buildRewritePrompt(
    strategy,
    options.originalText,
    options.contextText,
    options.researchDirection
  );

  const response = await callAI({
    provider: "deepseek",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  });

  const raw = await response.text();
  let suggestedText = parseResponse(raw);
  suggestedText = cleanRewriteOutput(suggestedText);

  // 长度校验：偏差超过 30% 时截断或提示
  const originalLen = options.originalText.length;
  const suggestedLen = suggestedText.length;
  const lengthRatio = originalLen > 0 ? suggestedLen / originalLen : 1;

  // 过短时追加提示重试一次（简单策略：如果短太多，直接用原文）
  if (lengthRatio < 0.5 && originalLen > 20) {
    // 改写太短，可能是 AI 理解错误，保留原文并标记
    suggestedText = options.originalText;
  }

  // 计算改写前后与原文的相似度
  const similarityBefore = 1.0; // 原文与自身完全相似
  const similarityAfter = calcTextSimilarity(options.originalText, suggestedText);

  return {
    strategy,
    suggestedText,
    similarityBefore,
    similarityAfter,
    lengthRatio,
  };
}

// ==================== 主入口 ====================

/** 为一段匹配文本生成多种降重改写建议（4 策略并行） */
export async function generateRewriteSuggestions(
  options: RewriteOptions
): Promise<RewriteResult[]> {
  const strategies: RewriteStrategy[] = ["synonym", "rephrase", "summarize", "expand"];

  // 并行调用 4 种策略
  const results = await Promise.all(
    strategies.map((strategy) =>
      rewriteWithStrategy(strategy, options).catch((err) => {
        console.error(`[rewrite] strategy=${strategy} failed:`, err);
        // 失败时返回空结果，不影响其他策略
        return {
          strategy,
          suggestedText: options.originalText,
          similarityBefore: 1,
          similarityAfter: 1,
          lengthRatio: 1,
        };
      })
    )
  );

  // 过滤掉与原文完全相同的（说明改写失败）
  const validResults = results.filter(
    (r) => r.suggestedText !== options.originalText || r.strategy === "synonym"
  );

  // 持久化到数据库
  try {
    const checkExists = await prisma.plagiarismCheck.count({
      where: { id: options.checkId },
    });
    if (checkExists > 0) {
      await prisma.rewriteSuggestion.createMany({
        data: validResults.map((r) => ({
          checkId: options.checkId,
          matchId: options.matchId ?? null,
          originalText: options.originalText,
          suggestedText: r.suggestedText,
          strategy: r.strategy,
          rewrittenSimilarity: Math.round(r.similarityAfter * 100) / 100,
        })),
      });
    }
  } catch (err) {
    console.error("[rewrite] persist failed:", err);
  }

  return validResults;
}

// ==================== 工具函数 ====================

function parseResponse(raw: string): string {
  try {
    const json = JSON.parse(raw);
    return json.choices?.[0]?.message?.content ?? raw;
  } catch {
    return raw;
  }
}

import prisma from "@/lib/prisma";
import { callAI } from "@/lib/ai";

export type RewriteStrategy = "synonym" | "rephrase" | "summarize" | "expand";

interface RewriteOptions {
  checkId: string;
  matchId?: string;
  originalText: string;
  contextText?: string;
}

const STRATEGY_LABELS: Record<RewriteStrategy, string> = {
  synonym: "同义替换",
  rephrase: "改写语序",
  summarize: "概括精简",
  expand: "扩写重组",
};

/** 为一段匹配文本生成多种降重改写建议 */
export async function generateRewriteSuggestions(
  options: RewriteOptions
): Promise<{ strategy: RewriteStrategy; suggestedText: string }[]> {
  const strategies: RewriteStrategy[] = ["synonym", "rephrase", "summarize", "expand"];
  const results: { strategy: RewriteStrategy; suggestedText: string }[] = [];

  for (const strategy of strategies) {
    const response = await callAI({
      provider: "deepseek",
      messages: [
        {
          role: "system",
          content: `你是一个学术写作助手。请对以下论文段落进行"${STRATEGY_LABELS[strategy]}"改写，以降低查重率。
要求：
1. 保持学术严谨性和原意
2. 保留专业术语不变
3. 输出的文本应该流畅自然
4. 只输出改写后的文本，不要加解释
5. 改写后的文本长度应当与原文相近${options.contextText ? "\n6. 结合上下文语境，确保改写后的段落衔接自然" : ""}`,
        },
        {
          role: "user",
          content: `原文：${options.originalText}${options.contextText ? `\n\n上下文：${options.contextText}` : ""}`,
        },
      ],
      stream: false,
    });

    const resultText = await parseResponse(response);
    results.push({ strategy, suggestedText: resultText });
  }

  // 批量保存到数据库（checkId 不存在时跳过持久化，仅返回生成结果）
  try {
    const checkExists = await prisma.plagiarismCheck.count({ where: { id: options.checkId } });
    if (checkExists > 0) {
      await prisma.rewriteSuggestion.createMany({
        data: results.map((r) => ({
          checkId: options.checkId,
          matchId: options.matchId ?? null,
          originalText: options.originalText,
          suggestedText: r.suggestedText,
          strategy: r.strategy,
        })),
      });
    }
  } catch {
    // 静默跳过持久化失败，不影响返回结果
  }

  return results;
}

async function parseResponse(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const json = JSON.parse(raw);
    return json.choices?.[0]?.message?.content ?? raw;
  } catch {
    return raw;
  }
}

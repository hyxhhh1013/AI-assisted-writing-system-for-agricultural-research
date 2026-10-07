import { callAINonStreaming } from "@/lib/ai";
import type { RagChunk } from "@/lib/rag";
import { cleanSourceName } from "@/lib/rag";

const RERANK_CAP = 12;

/**
 * 写作检索在已有主张时，用一次短调用把前 12 段按「能否支撑主张」重排。
 * 失败、超时或测试环境保持原顺序。
 */
export async function rerankChunksForClaims(
  chunks: RagChunk[],
  claims: string[],
): Promise<RagChunk[]> {
  if (process.env.VITEST || process.env.RAG_CLAIM_RERANK === "0") return chunks;
  const usable = claims.map((c) => c.trim()).filter((c) => c.length >= 8);
  if (usable.length === 0 || chunks.length < 4) return chunks;

  const top = chunks.slice(0, RERANK_CAP);
  const rest = chunks.slice(RERANK_CAP);
  const lines = top.map((chunk, i) => {
    const name = cleanSourceName(chunk.metadata.source);
    const excerpt = (chunk.content || "").replace(/\s+/g, " ").slice(0, 180);
    return `[${i}] ${name} ${excerpt}`;
  });

  try {
    const raw = await callAINonStreaming({
      provider: "deepseek",
      timeoutMs: 8_000,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "只输出一个 JSON 数组，元素是段落编号，按能否支撑主张从高到低排列。不要解释。",
        },
        {
          role: "user",
          content: `主张：\n${usable.join("\n")}\n\n段落：\n${lines.join("\n")}\n\n输出例如 [2,0,5]`,
        },
      ],
    });
    const matched = raw.match(/\[[\d,\s]+\]/);
    if (!matched) return chunks;
    const nums = JSON.parse(matched[0]) as unknown;
    if (!Array.isArray(nums)) return chunks;
    const seen = new Set<number>();
    const ordered: RagChunk[] = [];
    for (const n of nums) {
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= top.length || seen.has(n)) {
        continue;
      }
      seen.add(n);
      ordered.push(top[n]);
    }
    if (ordered.length === 0) return chunks;
    for (let i = 0; i < top.length; i++) {
      if (!seen.has(i)) ordered.push(top[i]);
    }
    return [...ordered, ...rest];
  } catch {
    return chunks;
  }
}

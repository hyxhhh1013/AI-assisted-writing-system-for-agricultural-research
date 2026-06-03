/**
 * 查重相似度算法工具集
 *
 * 保留的函数均为 plagiarism-service.ts 实际使用的。
 * 原 computeSimHash / hammingDistance / isSimHashMatch / fingerprintText / textSimilarity
 * 已移除（从未被使用）。
 */

/** 提取字符级 n-gram（对中文无需分词，直接按字切分） */
export function extractNGrams(text: string, n: number): Set<string> {
  const grams = new Set<string>();
  const cleaned = text.replace(/\s+/g, "").replace(/[^一-龥\w]/g, "");
  for (let i = 0; i <= cleaned.length - n; i++) {
    grams.add(cleaned.slice(i, i + n));
  }
  return grams;
}

/** Jaccard 相似度 (0-1) */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const item of a) {
    if (b.has(item)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** 计算余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// 查重相似度算法工具集

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

/** 将 n-gram 集合转为 SimHash 指纹 (64位) */
export function computeSimHash(grams: Set<string>): bigint {
  const bits = new Array(64).fill(0);
  for (const gram of grams) {
    const hash = hashString(gram);
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & BigInt(1);
      bits[i] += bit === BigInt(1) ? 1 : -1;
    }
  }
  let fingerprint = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (bits[i] > 0) {
      fingerprint |= BigInt(1) << BigInt(i);
    }
  }
  return fingerprint;
}

/** 两个 SimHash 之间的海明距离 */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor) {
    count += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return count;
}

/** SimHash 在海明距离阈值内是否匹配 */
export function isSimHashMatch(a: bigint, b: bigint, threshold = 8): boolean {
  return hammingDistance(a, b) <= threshold;
}

/** 文本块指纹（包含 n-gram 集合和 SimHash） */
export interface TextFingerprint {
  text: string;
  offset: number;
  ngrams: Set<string>;
  simhash: bigint;
  length: number;
}

/** 将长文本按滑动窗口切分为指纹块 */
export function fingerprintText(
  text: string,
  windowSize = 100,
  step = 50,
  gramSize = 4
): TextFingerprint[] {
  const cleaned = text.replace(/\s+/g, "").replace(/<[^>]+>/g, "");
  const fingerprints: TextFingerprint[] = [];
  for (let i = 0; i < cleaned.length; i += step) {
    const chunk = cleaned.slice(i, i + windowSize);
    if (chunk.length < 20) continue;
    const ngrams = extractNGrams(chunk, gramSize);
    fingerprints.push({
      text: chunk,
      offset: i,
      ngrams,
      simhash: computeSimHash(ngrams),
      length: chunk.length,
    });
  }
  return fingerprints;
}

/** 文本间直接相似度（滑动窗口比较） */
export function textSimilarity(textA: string, textB: string): number {
  const aGrams = extractNGrams(textA, 4);
  const bGrams = extractNGrams(textB, 4);
  return jaccardSimilarity(aGrams, bGrams);
}

// ====== Embedding 语义相似度 ======

/** 计算余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ====== 辅助：字符串哈希（DJBP2） ======

function hashString(str: string): bigint {
  let hash = BigInt(5381);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << BigInt(5)) + hash) + BigInt(str.charCodeAt(i));
  }
  return hash & ((BigInt(1) << BigInt(64)) - BigInt(1));
}

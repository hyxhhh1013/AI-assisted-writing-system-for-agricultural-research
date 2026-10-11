import { extractNGrams, jaccardSimilarity } from "@/lib/similarity";

const DEFAULT_N = 4;
const MAX_POSTING = 32;

/** 包含率：query 的 n-gram 有多少出现在 candidate 里。短句对长文不会被对称 Jaccard 压低。 */
export function containmentSimilarity(query: string, candidate: string, n = DEFAULT_N): number {
  const grams = extractNGrams(query, n);
  if (grams.size === 0) return 0;
  const target = extractNGrams(candidate, n);
  let hit = 0;
  for (const gram of grams) {
    if (target.has(gram)) hit += 1;
  }
  return hit / grams.size;
}

/** 旧口径，仅用于对照测试。 */
export function jaccardOfTexts(a: string, b: string, n = DEFAULT_N): number {
  return jaccardSimilarity(extractNGrams(a, n), extractNGrams(b, n));
}

export interface IndexedPassage {
  text: string;
  from: string;
}

interface PassageIndex {
  passages: IndexedPassage[];
  postings: Map<string, number[]>;
}

export function buildPassageIndex(passages: IndexedPassage[], n = DEFAULT_N): PassageIndex {
  const postings = new Map<string, number[]>();
  passages.forEach((passage, index) => {
    for (const gram of extractNGrams(passage.text, n)) {
      const list = postings.get(gram);
      if (!list) {
        postings.set(gram, [index]);
      } else if (list.length < MAX_POSTING && list[list.length - 1] !== index) {
        list.push(index);
      }
    }
  });
  return { passages, postings };
}

/** 用共享 n-gram 取候选，再由调用方算包含率。 */
export function topPassages(index: PassageIndex, query: string, limit: number, n = DEFAULT_N): IndexedPassage[] {
  const scores = new Map<number, number>();
  for (const gram of extractNGrams(query, n)) {
    const hits = index.postings.get(gram);
    if (!hits) continue;
    for (const id of hits) {
      scores.set(id, (scores.get(id) ?? 0) + 1);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([id]) => index.passages[id])
    .filter((passage): passage is IndexedPassage => Boolean(passage));
}

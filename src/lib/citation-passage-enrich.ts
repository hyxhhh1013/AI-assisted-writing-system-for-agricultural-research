/**
 * 把知识库 PDF 命中段落补进 grounding 语料。
 * 仅服务端使用（localRAG）；失败则原样返回，不阻断主检。
 */

import prisma from "@/lib/prisma";
import { localRAG } from "@/lib/rag";
import { basenameKey } from "@/lib/agent/reading-pack";
import type { CitationGroundingRef } from "@/contracts/citation-grounding";
import { extractCitationContext } from "@/lib/citation-grounding";
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";

const MAX_PAPERS = 8;
const MAX_EXCERPT_CHARS = 1600;

function firstCitedSentence(draftText: string, number: number): string {
  const normalized = normalizeAllCitationFormats(draftText);
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    if (expandCitationGroup(m[1]).includes(number)) {
      return extractCitationContext(normalized, m.index);
    }
  }
  return "";
}

/**
 * 对已引用编号，按 ReferenceSource 精读该 PDF 与句子最相关的段落，写入 content。
 */
export async function enrichCitedRefsWithPassages(input: {
  projectId: string;
  draftText: string;
  references: CitationGroundingRef[];
  citedNumbers: number[];
}): Promise<CitationGroundingRef[]> {
  const cited = [...new Set(input.citedNumbers.filter((n) => n >= 1))].slice(0, MAX_PAPERS);
  if (cited.length === 0) return input.references;

  let sources: Array<{ refIndex: number; sourceName: string }> = [];
  try {
    sources = await prisma.referenceSource.findMany({
      where: { projectId: input.projectId },
      select: { refIndex: true, sourceName: true },
    });
  } catch {
    return input.references;
  }
  const byIndex = new Map(sources.map((s) => [s.refIndex, s.sourceName]));
  const out = input.references.map((r) => ({ ...r }));
  const byRef = new Map(out.map((r) => [r.index, r]));

  for (const num of cited) {
    const sourceName = byIndex.get(num)?.trim();
    const ref = byRef.get(num);
    if (!sourceName || !ref) continue;
    const sentence = firstCitedSentence(input.draftText, num);
    const query = (sentence || ref.title || "").slice(0, 240);
    if (query.length < 8) continue;
    try {
      const chunks = await localRAG.search(query, {
        limit: 8,
        maxPerSource: 6,
        multiQuery: false,
      });
      const key = basenameKey(sourceName);
      const excerpts = chunks
        .filter((c) => basenameKey(c.metadata.source) === key)
        .map((c) => c.content.trim())
        .filter((t) => t.length >= 40)
        .slice(0, 3);
      if (excerpts.length === 0) continue;
      const passage = excerpts.join("\n").slice(0, MAX_EXCERPT_CHARS);
      ref.content = [ref.content, passage].filter(Boolean).join("\n");
    } catch {
      // 单篇失败不影响其余
    }
  }
  return out;
}

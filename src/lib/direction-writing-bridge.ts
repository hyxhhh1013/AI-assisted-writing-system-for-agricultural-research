/** Direction → Writing 桥接逻辑
 *
 * 从 Direction 的资产清点和分析结果中提取论文写作所需的文献清单和上下文。
 * 纯服务端函数，通过 Prisma 直接访问数据库。
 */

import prisma from "@/lib/prisma";
import type { DirectionAnalysis, PaperCandidate } from "@/contracts/direction";
import type {
  DirectionLiteratureEntry,
} from "@/contracts/direction-literature";
import {
  parseDirectionLiteratureState,
  corpusEntryToRequiredReference,
} from "@/contracts/direction-literature";
import type {
  DirectionWritingContext,
  RequiredReference,
  SourceRole,
} from "@/contracts/direction-writing-bridge";

// ==================== 常量 ====================

/** 单篇论文最多带多少预确定文献 */
const MAX_REQUIRED_REFS = 50;

/** 文献角色推断：按标题与候选论文标题的关键词重叠度 */
function inferRole(
  refTitle: string,
  candidateTitle: string,
): SourceRole {
  const refLower = refTitle.toLowerCase();
  const candLower = candidateTitle.toLowerCase();

  // 提取候选论文的核心关键词（拆词取长度 ≥ 2 的片段）
  const keywords = candLower
    .split(/[\s,，、]+/)
    .filter((w) => w.length >= 2);

  const matchCount = keywords.filter((kw) => refLower.includes(kw)).length;
  if (matchCount >= 3) return "core";
  if (matchCount >= 1) return "supporting";
  return "background";
}

// ==================== 文献提取 ====================

function extractRequiredRefs(
  kbFiles: Array<{
    name: string;
    bib: unknown;
    category: string;
  }>,
  candidateTitle: string,
): RequiredReference[] {
  const refs: RequiredReference[] = [];

  for (const f of kbFiles) {
    let bib: Record<string, unknown> | null = null;
    try {
      bib = typeof f.bib === "string"
        ? (JSON.parse(f.bib) as Record<string, unknown>)
        : (f.bib as Record<string, unknown> | null);
    } catch { continue; }

    if (!bib?.title) continue;

    const title = String(bib.title);
    const authors: string[] = Array.isArray(bib.authors)
      ? bib.authors.map((a) => String(a))
      : [];
    const year = Number(bib.year) || 0;
    const journal = bib.journal ? String(bib.journal) : undefined;
    const doi = bib.doi ? String(bib.doi) : undefined;

    const role = inferRole(title, candidateTitle);

    refs.push({
      sourceKey: f.name,
      title,
      authors,
      year,
      journal,
      doi,
      role,
      assignedSections: role === "core"
        ? ["literature_body"]
        : role === "supporting"
          ? ["literature_body", "background"]
          : ["introduction", "background"],
    });
  }

  // 按角色排序：core → supporting → background
  const roleOrder: Record<SourceRole, number> = { core: 0, supporting: 1, background: 2 };
  refs.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  return refs.slice(0, MAX_REQUIRED_REFS);
}

function mergeRequiredReferences(
  primary: RequiredReference[],
  fallback: RequiredReference[],
): RequiredReference[] {
  const seen = new Set<string>();
  const merged: RequiredReference[] = [];
  for (const ref of [...primary, ...fallback]) {
    const key = (ref.doi || ref.sourceKey || ref.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  return merged.slice(0, MAX_REQUIRED_REFS);
}

export function corpusEntriesFromRefs(
  entries: DirectionLiteratureEntry[],
  selectedIds?: string[],
): DirectionLiteratureEntry[] {
  if (!selectedIds?.length) return entries;
  const set = new Set(selectedIds);
  return entries.filter((e) => set.has(e.id));
}

// ==================== 主题提取 ====================

function extractThemes(
  candidate: PaperCandidate | undefined,
  analysis: DirectionAnalysis | null,
): string[] {
  const themes: string[] = [];

  // 从候选论文的维度评分提取主题线索
  if (candidate) {
    const d2 = candidate.dimensionScores?.D2; // 研究问题框架
    const d7 = candidate.dimensionScores?.D7; // 创新性

    if (d2 != null && d2 >= 6) {
      themes.push("研究问题明确，建议以问题驱动组织文献综述");
    }
    if (d7 != null && d7 >= 7) {
      themes.push("创新性较高，建议突出与已有研究的对比");
    }
    if (d7 != null && d7 < 5) {
      themes.push("创新性偏低，建议以方法学严谨性和数据充分性为卖点");
    }
  }

  // 从分析结果的缺口提取
  const gaps = analysis?.dimensions?.find((d) => d.id === "D3");
  if (gaps?.summary) {
    themes.push(`研究缺口：${gaps.summary.slice(0, 100)}`);
  }

  return themes;
}

// ==================== 主语函数 ====================

interface BuildPaperBriefParams {
  directionSlug: string;
  candidateId?: string;
  userId: string;
}

export async function buildPaperBrief(
  params: BuildPaperBriefParams,
): Promise<DirectionWritingContext> {
  const { directionSlug, candidateId, userId } = params;

  const direction = await prisma.direction.findFirst({
    where: { slug: directionSlug, userId },
  });
  if (!direction) {
    throw new Error(`方向不存在: ${directionSlug}`);
  }

  const literatureState = parseDirectionLiteratureState(direction.literatureCorpus);
  const corpusEntries = literatureState.entries;

  const categories = direction.categories as string[];

  // 知识库补全（corpus 为空或需 fallback 时）
  const kbFiles = await prisma.knowledgeFile.findMany({
    where: { category: { in: categories } },
    select: { name: true, bib: true, category: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  // 3. 获取分析数据
  const analysis = direction.analysis as DirectionAnalysis | null;
  const candidates = analysis?.paperCandidates || [];
  const candidate = candidateId
    ? candidates.find((c) => c.id === candidateId)
    : candidates[0];

  const candidateTitle = candidate?.title || direction.name;

  // 4. 确定论文类型
  // 默认综述——方向战略规划的主要产出是综述论文。
  // 后续可在路线图 UI 中让用户选择。
  const paperType: "review" | "research" = "review";

  const corpusRefs = corpusEntries.map(corpusEntryToRequiredReference);
  const kbRefs = extractRequiredRefs(kbFiles, candidateTitle);
  const requiredReferences =
    corpusRefs.length > 0
      ? mergeRequiredReferences(corpusRefs, kbRefs)
      : kbRefs;

  // 5. 组装
  return {
    paperType,
    suggestedJournal: candidate?.suggestedJournal,
    requiredReferences,
    literatureCorpusConfirmedAt: literatureState.confirmedAt,
    motivationFromGap: candidate
      ? `来自方向"${direction.name}"的 8 维度分析。该论文整体评分 ${candidate.overallScore}/10，等级 ${candidate.tier}。`
      : undefined,
    pendingExperiments: candidate?.requiredExperiments || [],
    themeSuggestions: extractThemes(candidate, analysis),
    roadmapCandidateId: candidateId,
  };
}

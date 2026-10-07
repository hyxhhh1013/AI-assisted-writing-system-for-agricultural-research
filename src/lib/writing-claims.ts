import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { mapToSectionForMode } from "@/lib/utils";

/** 本节蓝图主张 / 要点，最多 3 条，用作单独检索 query。 */
export function collectWritingClaims(
  blueprint: WritingBlueprint | null | undefined,
  section: string,
  mode?: "review" | "research",
  subsectionTitle?: string,
): string[] {
  if (!blueprint) return [];
  let guides = blueprint.sectionGuides.filter(
    (g) => mapToSectionForMode(g.sectionPath, mode) === section,
  );
  const sub = subsectionTitle?.trim();
  if (sub) {
    const nested = guides.filter(
      (g) => g.sectionPath.includes(sub) || g.sectionPath.endsWith(sub),
    );
    if (nested.length > 0) guides = nested;
  }
  const claims: string[] = [];
  for (const guide of guides) {
    const claim = guide.claim?.trim();
    if (claim && claim.length >= 8) claims.push(claim);
    for (const point of guide.keyPoints || []) {
      const text = point.trim();
      if (text.length >= 8) claims.push(text);
    }
  }
  const uniq: string[] = [];
  for (const claim of claims) {
    if (!uniq.includes(claim)) uniq.push(claim);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

/** 每条主张单独成 query，并带上题名和方向，避免只剩章节套话。 */
export function writingClaimQueries(params: {
  title: string;
  researchDirection?: string;
  claims: string[];
}): string[] {
  const head = [params.researchDirection, params.title].filter(Boolean).join(" ");
  const out: string[] = [];
  for (const claim of params.claims) {
    const query = `${claim} ${head}`.trim().slice(0, 400);
    if (query.length >= 8 && !out.includes(query)) out.push(query);
    if (out.length >= 3) break;
  }
  return out;
}

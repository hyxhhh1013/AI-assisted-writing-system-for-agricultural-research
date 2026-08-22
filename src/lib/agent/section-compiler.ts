/**
 * WRITE-QA-002：蓝图 + 语域 + 字数带 → SectionSpecV1。
 * 证据槽由 004 Evidence Binder 填写。不改冻结写作管道。
 */

import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import { MAX_WRITING_BULLETS } from "@/contracts/writing";
import {
  defaultConstraintsFor,
  isSectionSpecKey,
  liftWriteSectionInputToSpec,
  registerFromSectionKey,
  sectionGuideToClaimCards,
  type SectionClaimCard,
  type SectionSpecConstraints,
  type SectionSpecV1,
} from "@/contracts/section-spec";
import { getDraftSectionTargets } from "@/lib/draft-coverage";
import {
  collectBlueprintAssignedSourceTokens,
  resolveAssignedSourcesToSelectedIds,
} from "@/lib/agent/blueprint-write-context";
import { figureBelongsToSection } from "@/lib/blueprint-utils";
import { mapToSectionForMode } from "@/lib/utils";

const EN_CHAR_SCALE = 0.55;
const EN_SUBSECTION_MAX = 1400;

export type SectionSpecCardSource = "bullets" | "blueprint" | "context" | "empty";

export interface CompileSectionSpecInput {
  sectionKey: string;
  subsectionTitle?: string;
  context?: string;
  bullets?: string[];
  mode?: ProjectWritingMode;
  language?: "zh" | "en";
  blueprint?: WritingBlueprint | null;
  /** 已解析的 RAG 文件名；有则优先于蓝图 token */
  selectedSourceIds?: string[];
  referenceSourceNames?: { refIndex: number; sourceName: string }[];
}

export interface CompileSectionSpecResult {
  spec: SectionSpecV1;
  source: SectionSpecCardSource;
}

function scaleConstraints(
  constraints: SectionSpecConstraints,
  language: "zh" | "en",
): SectionSpecConstraints {
  if (language === "zh") return constraints;
  return {
    ...constraints,
    minChars: Math.round(constraints.minChars * EN_CHAR_SCALE),
    maxChars: Math.round(constraints.maxChars * EN_CHAR_SCALE),
  };
}

function applyDraftCoverageFloor(
  constraints: SectionSpecConstraints,
  sectionKey: string,
  mode: ProjectWritingMode,
  language: "zh" | "en",
  subsectionTitle?: string,
): SectionSpecConstraints {
  if (subsectionTitle) return constraints;
  const target = getDraftSectionTargets(mode, language).find((t) => t.key === sectionKey);
  if (!target) return constraints;
  return {
    ...constraints,
    minChars: Math.max(constraints.minChars, target.minChars),
  };
}

function applySubsectionCap(
  constraints: SectionSpecConstraints,
  language: "zh" | "en",
  subsectionTitle?: string,
): SectionSpecConstraints {
  if (!subsectionTitle?.trim()) return constraints;
  const cap = language === "en" ? EN_SUBSECTION_MAX : 2500;
  return {
    ...constraints,
    maxChars: Math.min(constraints.maxChars, cap),
  };
}

function selectGuides(
  blueprint: WritingBlueprint,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  subsectionTitle?: string,
) {
  const guides = blueprint.sectionGuides.filter(
    (g) => mapToSectionForMode(g.sectionPath, mode) === sectionKey,
  );
  const sub = subsectionTitle?.trim();
  if (sub) {
    const nested = guides.filter(
      (g) => g.sectionPath.includes(sub) || g.sectionPath.endsWith(sub),
    );
    if (nested.length > 0) return nested;
  }
  const topLevel = guides.filter((g) => !g.sectionPath.includes(">"));
  if (!sub && topLevel.length > 0) return topLevel;
  return guides;
}

function cardsFromGuides(guides: ReturnType<typeof selectGuides>): SectionClaimCard[] {
  if (guides.length === 0) return [];
  if (guides.length === 1) {
    return sectionGuideToClaimCards(guides[0]).slice(0, MAX_WRITING_BULLETS);
  }
  const cards: SectionClaimCard[] = [];
  for (const g of guides) {
    for (const card of sectionGuideToClaimCards(g)) {
      cards.push({
        ...card,
        id: `C${cards.length + 1}`,
      });
      if (cards.length >= MAX_WRITING_BULLETS) return cards;
    }
  }
  return cards;
}

function collectFigureSlots(
  blueprint: WritingBlueprint,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  subsectionTitle?: string,
): string[] {
  const sub = subsectionTitle?.trim();
  const slots: string[] = [];
  for (const item of blueprint.figurePlan.items) {
    const matchesKey = mapToSectionForMode(item.sectionPath, mode) === sectionKey;
    const matchesSub = sub
      ? item.sectionPath.includes(sub) || figureBelongsToSection(item.sectionPath, sub)
      : matchesKey;
    if (!matchesKey && !matchesSub) continue;
    const slot = item.id.trim() || item.suggestedCaption.trim();
    if (slot) slots.push(slot);
    if (slots.length >= 6) break;
  }
  return slots;
}

/**
 * 编译本节合同。
 * 主张来源：用户 bullets > 蓝图 keyPoints/claim > context 整段 > 空 cards。
 */
export function compileSectionSpec(
  input: CompileSectionSpecInput,
): CompileSectionSpecResult | null {
  const lifted = liftWriteSectionInputToSpec({
    sectionKey: input.sectionKey,
    subsectionTitle: input.subsectionTitle,
    context: input.context,
    bullets: input.bullets,
  });
  if (!lifted || !isSectionSpecKey(input.sectionKey)) return null;

  const language = input.language === "en" ? "en" : "zh";
  const mode = input.mode === "review" ? "review" : "research";
  const subsectionTitle = input.subsectionTitle?.trim() || undefined;
  const register = registerFromSectionKey(input.sectionKey);
  if (!register) return null;

  const userBullets = (input.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const blueprint = input.blueprint ?? null;
  const guides = blueprint
    ? selectGuides(blueprint, input.sectionKey, input.mode, subsectionTitle)
    : [];

  let source: SectionSpecCardSource = "empty";
  let claimCards = lifted.claimCards;
  if (userBullets.length > 0) {
    source = "bullets";
    claimCards = lifted.claimCards;
    const warrant = guides[0]?.warrant?.trim();
    if (warrant && claimCards[0] && !claimCards[0].warrant) {
      claimCards = [{ ...claimCards[0], warrant }, ...claimCards.slice(1)];
    }
  } else if (guides.length > 0) {
    const fromGuide = cardsFromGuides(guides);
    if (fromGuide.length > 0) {
      source = "blueprint";
      claimCards = fromGuide;
    } else if (lifted.claimCards.length > 0) {
      source = "context";
    }
  } else if (lifted.claimCards.length > 0) {
    source = "context";
  }

  let constraints = defaultConstraintsFor(register, { subsectionTitle });
  constraints = scaleConstraints(constraints, language);
  constraints = applyDraftCoverageFloor(
    constraints,
    input.sectionKey,
    mode,
    language,
    subsectionTitle,
  );
  constraints = applySubsectionCap(constraints, language, subsectionTitle);

  let assignedSourceIds = (input.selectedSourceIds ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (assignedSourceIds.length === 0 && blueprint) {
    assignedSourceIds =
      resolveAssignedSourcesToSelectedIds(
        collectBlueprintAssignedSourceTokens({
          blueprint,
          sectionKey: input.sectionKey,
          mode: input.mode,
          subsectionTitle,
        }),
        input.referenceSourceNames,
      ) ?? [];
  }

  const figureSlots = blueprint
    ? collectFigureSlots(blueprint, input.sectionKey, input.mode, subsectionTitle)
    : [];

  const spec: SectionSpecV1 = {
    version: 1,
    sectionKey: input.sectionKey,
    subsectionTitle,
    register,
    claimCards,
    constraints,
    assignedSourceIds,
    figureSlots,
  };
  return { spec, source };
}

/**
 * 蓝图 cards → bullets。写节热路径不再把这批 bullets 打进 Writer
 * （蓝图 hint 里已有同一批要点，再打会重复占 token）。
 */
export function bulletsFromCompiledSpec(result: CompileSectionSpecResult | null): string[] | undefined {
  if (!result || result.source !== "blueprint") return undefined;
  const bullets = result.spec.claimCards.map((c) => c.claim).filter(Boolean);
  return bullets.length > 0 ? bullets : undefined;
}

import type { PassportProgressSignals } from "@/lib/paper-passport-progress";
import type { PaperPassport } from "@/contracts/paper-passport";

/** sync 时写入 passport 各阶段进度快照 */
export function enrichPassportSnapshots(
  passport: PaperPassport,
  signals: PassportProgressSignals,
): PaperPassport {
  const now = Date.now();
  return {
    ...passport,
    literature: {
      referenceCount: signals.referenceCount,
      updatedAt: now,
    },
    draftProgress: {
      filledCoreSections: signals.filledCoreSections,
      totalCoreSections: signals.totalCoreSections,
      expandedOutlineCount: signals.expandedOutlineCount,
      outlineChars: signals.outlineChars,
      hasBlueprint: signals.hasBlueprint,
      updatedAt: now,
    },
    argument: {
      chainCount: signals.argumentChainCount ?? 0,
      rebuttalCount: signals.argumentRebuttalCount ?? 0,
      updatedAt: now,
    },
    abstractSnapshot: {
      chars: signals.abstractChars,
      updatedAt: now,
      zh: passport.abstractSnapshot?.zh,
      en: passport.abstractSnapshot?.en,
    },
    reviewRound: {
      doneCount: signals.reviewDoneCount,
      updatedAt: now,
      lastScore: passport.reviewRound?.lastScore,
      lastGrade: passport.reviewRound?.lastGrade,
      lastCheckId: passport.reviewRound?.lastCheckId,
      maxRounds: passport.reviewRound?.maxRounds ?? 2,
    },
    citationGate: {
      passed: Boolean(signals.citationGatePassed),
      exportReady: Boolean(
        signals.citationExportReady ?? signals.citationGatePassed,
      ),
      refCount: signals.referenceCount,
      citationCount: signals.citationCount ?? 0,
      outOfBounds: signals.citationOutOfBounds ?? [],
      updatedAt: now,
    },
    updatedAt: now,
  };
}

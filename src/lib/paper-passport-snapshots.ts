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
    argument: {
      claimCount: signals.hasConfirmedArgument
        ? Math.max(passport.argument?.claimCount ?? 1, 1)
        : (passport.argument?.claimCount ?? 0),
      confirmed: signals.hasConfirmedArgument,
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
    abstractSnapshot: {
      chars: signals.abstractChars,
      updatedAt: now,
    },
    reviewRound: {
      doneCount: signals.reviewDoneCount,
      updatedAt: now,
    },
    exportFormats: passport.exportFormats ?? {
      formats: [],
      updatedAt: now,
    },
    updatedAt: now,
  };
}

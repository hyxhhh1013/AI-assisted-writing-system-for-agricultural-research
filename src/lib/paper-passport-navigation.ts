import type { PaperPhase } from "@/contracts/paper-passport";

/** Cockpit 点击阶段时的导航动作（由 workbench 解释执行） */
export type CockpitNavigationAction =
  | { type: "workbench-tab"; tab: string }
  | { type: "open-meta" }
  | { type: "focus-section"; sectionKey: string };

export function getPhaseNavigationAction(phase: PaperPhase): CockpitNavigationAction | null {
  switch (phase) {
    case 0:
      return { type: "open-meta" };
    case 1:
      return { type: "workbench-tab", tab: "reader" };
    case 2:
      return { type: "workbench-tab", tab: "outline" };
    case 3:
    case 4:
      return { type: "workbench-tab", tab: "writing" };
    case 5:
      return { type: "workbench-tab", tab: "structure" };
    case 6:
      return { type: "focus-section", sectionKey: "abstract" };
    case 7:
      return { type: "workbench-tab", tab: "plagiarism" };
    default:
      return null;
  }
}

export function isPhaseNavigable(
  phase: PaperPhase,
  status: string,
): boolean {
  return status !== "locked" && getPhaseNavigationAction(phase) !== null;
}

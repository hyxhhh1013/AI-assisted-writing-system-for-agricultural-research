import type { PaperPhase } from "@/contracts/paper-passport";

/** Cockpit 点击阶段时的导航动作（由 workbench 解释执行） */
export type CockpitNavigationAction =
  | { type: "workbench-tab"; tab: string }
  | { type: "open-meta" }
  | { type: "focus-section"; sectionKey: string }
  | { type: "open-export" };

export type CockpitControlMode = "human" | "agent";

/** 各阶段主工作台 Tab（与左侧图标栏对齐） */
export type WorkbenchPhaseTab =
  | "structure"
  | "outline"
  | "writing"
  | "reader"
  | "plagiarism";

export const PHASE_PRIMARY_TAB: Record<PaperPhase, WorkbenchPhaseTab | "meta" | "export"> = {
  0: "meta",
  1: "reader",
  2: "outline",
  3: "outline", // 论证蓝图挂在提纲侧栏
  4: "writing",
  5: "structure",
  6: "plagiarism",
  7: "export",
};

export const PHASE_TAB_LABELS: Record<WorkbenchPhaseTab | "meta" | "export", string> = {
  meta: "项目配置",
  structure: "章节结构",
  outline: "论证提纲",
  writing: "章节协作",
  reader: "补录文献",
  plagiarism: "质量检测",
  export: "导出成稿",
};

export function getPrimaryTabForPhase(phase: PaperPhase): WorkbenchPhaseTab | "meta" | "export" {
  return PHASE_PRIMARY_TAB[phase];
}

export function isTabAlignedWithPhase(
  tab: string,
  phase: PaperPhase,
): boolean {
  const primary = getPrimaryTabForPhase(phase);
  if (primary === "meta") return tab === "structure";
  if (primary === "export") return tab === "structure";
  return tab === primary;
}

export function getPhaseNavigationAction(phase: PaperPhase): CockpitNavigationAction | null {
  switch (phase) {
    case 0:
      return { type: "open-meta" };
    case 1:
      return { type: "workbench-tab", tab: "reader" };
    case 2:
      return { type: "workbench-tab", tab: "outline" };
    case 3:
      return { type: "workbench-tab", tab: "outline" };
    case 4:
      return { type: "workbench-tab", tab: "writing" };
    case 5:
      return { type: "focus-section", sectionKey: "abstract" };
    case 6:
      return { type: "workbench-tab", tab: "plagiarism" };
    case 7:
      return { type: "open-export" };
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

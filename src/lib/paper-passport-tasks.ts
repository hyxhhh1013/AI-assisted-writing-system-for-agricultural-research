import type { PaperPassport, PaperPhase } from "@/contracts/paper-passport";
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";
import type { CockpitControlMode } from "@/lib/paper-passport-navigation";
import type { CockpitNavigationAction } from "@/lib/paper-passport-navigation";

export type PhaseTaskStatus = "done" | "pending" | "locked";

export interface PhaseTask {
  id: string;
  label: string;
  status: PhaseTaskStatus;
  navigation?: CockpitNavigationAction | null;
}

function task(
  id: string,
  label: string,
  done: boolean,
  navigation: CockpitNavigationAction | null,
  locked = false,
): PhaseTask {
  return {
    id,
    label,
    status: locked ? "locked" : done ? "done" : "pending",
    navigation: locked ? null : navigation,
  };
}

const TASK_NAV: Record<string, CockpitNavigationAction> = {
  "cfg-type": { type: "open-meta" },
  "cfg-journal": { type: "open-meta" },
  "cfg-words": { type: "open-meta" },
  "cfg-lang": { type: "open-meta" },
  "cfg-cite": { type: "open-meta" },
  "ref-import": { type: "workbench-tab", tab: "reader" },
  "ref-browse": { type: "workbench-tab", tab: "reader" },
  "outline-skeleton": { type: "workbench-tab", tab: "outline" },
  "outline-gen": { type: "workbench-tab", tab: "outline" },
  "blueprint-gen": { type: "workbench-tab", tab: "outline" },
  "expand-first": { type: "workbench-tab", tab: "writing" },
  "expand-blueprint": { type: "workbench-tab", tab: "outline" },
  "draft-start": { type: "workbench-tab", tab: "structure" },
  "draft-all": { type: "workbench-tab", tab: "structure" },
  "cite-count": { type: "workbench-tab", tab: "reader" },
  "cite-body": { type: "workbench-tab", tab: "structure" },
  "abstract-write": { type: "focus-section", sectionKey: "abstract" },
  "review-run": { type: "workbench-tab", tab: "plagiarism" },
  "review-round2": { type: "workbench-tab", tab: "plagiarism" },
};

export function resolveTaskNavigation(
  taskId: string,
  controlMode: CockpitControlMode,
): CockpitNavigationAction | null {
  if (
    controlMode === "agent"
    && (taskId === "expand-first" || taskId === "draft-start" || taskId === "draft-all" || taskId.startsWith("review"))
  ) {
    return { type: "workbench-tab", tab: "agent" };
  }
  return TASK_NAV[taskId] ?? null;
}

/** 当前阶段任务清单（纯函数，供 Cockpit 任务卡渲染） */
export function getPhaseTasks(
  phase: PaperPhase,
  passport: PaperPassport,
  signals: PassportProgressSignals,
  controlMode: CockpitControlMode = "human",
): PhaseTask[] {
  const cfg = passport.config;
  const nav = (id: string) => resolveTaskNavigation(id, controlMode);

  switch (phase) {
    case 0:
      return [
        task("cfg-type", "确认论文类型（综述 / 原创）", Boolean(cfg?.paperType), nav("cfg-type")),
        task("cfg-journal", "填写目标期刊", Boolean(cfg?.targetJournal?.trim()), nav("cfg-journal")),
        task("cfg-words", "设定目标字数", Boolean(cfg?.wordCount?.trim()), nav("cfg-words")),
        task("cfg-lang", "选择写作语言", Boolean(cfg?.language), nav("cfg-lang")),
        task("cfg-cite", "选择引用格式", Boolean(cfg?.citationStyle), nav("cfg-cite")),
      ];
    case 1:
      return [
        task("ref-import", "补录参考文献", signals.referenceCount >= 1, nav("ref-import")),
        task("ref-browse", "确认引用列表", signals.referenceCount >= 1, nav("ref-browse")),
      ];
    case 2:
      return [
        task("outline-skeleton", "填写章节骨架", signals.outlineChars > 0, nav("outline-skeleton")),
        task("outline-gen", "生成论证提纲", signals.outlineChars >= 80, nav("outline-gen")),
        task("blueprint-gen", "生成写作蓝图", signals.hasBlueprint, nav("blueprint-gen")),
      ];
    case 3:
      return [
        task("expand-first", "扩写至少 1 个子节", signals.expandedOutlineCount >= 1, nav("expand-first")),
        task(
          "expand-blueprint",
          "蓝图与大纲保持一致",
          signals.hasBlueprint && signals.outlineChars >= 80,
          nav("expand-blueprint"),
        ),
      ];
    case 4: {
      const ratio = signals.totalCoreSections > 0
        ? signals.filledCoreSections / signals.totalCoreSections
        : 0;
      return [
        task("draft-start", "开始撰写核心章节", ratio >= 0.2, nav("draft-start")),
        task("draft-all", "完成全部核心章节", ratio >= 1, nav("draft-all")),
      ];
    }
    case 5:
      return [
        task("cite-count", "参考文献不少于 3 篇", signals.referenceCount >= 3, nav("cite-count")),
        task(
          "cite-body",
          "正文引用编号已核对",
          signals.filledCoreSections >= Math.ceil(signals.totalCoreSections * 0.5),
          nav("cite-body"),
        ),
      ];
    case 6:
      return [
        task("abstract-write", "撰写摘要（≥80 字）", signals.abstractChars >= 80, nav("abstract-write")),
      ];
    case 7:
      return [
        task("review-run", "运行至少 1 次论文审查", signals.reviewDoneCount >= 1, nav("review-run")),
        task("review-round2", "完成第 2 轮审查（可选）", signals.reviewDoneCount >= 2, nav("review-round2")),
      ];
    default:
      return [];
  }
}

export function countPendingTasks(tasks: PhaseTask[]): number {
  return tasks.filter((t) => t.status === "pending").length;
}

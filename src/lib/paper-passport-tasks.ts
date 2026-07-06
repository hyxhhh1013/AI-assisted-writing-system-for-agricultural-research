import type { PaperPassport, PaperPhase } from "@/contracts/paper-passport";
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";

export type PhaseTaskStatus = "done" | "pending" | "locked";

export interface PhaseTask {
  id: string;
  label: string;
  status: PhaseTaskStatus;
}

function task(id: string, label: string, done: boolean, locked = false): PhaseTask {
  return { id, label, status: locked ? "locked" : done ? "done" : "pending" };
}

/** 当前阶段任务清单（纯函数，供 Cockpit 任务卡渲染） */
export function getPhaseTasks(
  phase: PaperPhase,
  passport: PaperPassport,
  signals: PassportProgressSignals,
): PhaseTask[] {
  const cfg = passport.config;

  switch (phase) {
    case 0:
      return [
        task("cfg-type", "确认论文类型（综述 / 原创）", Boolean(cfg?.paperType)),
        task("cfg-journal", "填写目标期刊", Boolean(cfg?.targetJournal?.trim())),
        task("cfg-words", "设定目标字数", Boolean(cfg?.wordCount?.trim())),
        task("cfg-lang", "选择写作语言", Boolean(cfg?.language)),
        task("cfg-cite", "选择引用格式", Boolean(cfg?.citationStyle)),
      ];
    case 1:
      return [
        task("ref-import", "导入至少 1 篇参考文献", signals.referenceCount >= 1),
        task("ref-browse", "在文献库浏览/检索", signals.referenceCount >= 1),
      ];
    case 2:
      return [
        task("outline-skeleton", "填写章节骨架", signals.outlineChars > 0),
        task("outline-gen", "生成论证提纲", signals.outlineChars >= 80),
        task("blueprint-gen", "生成写作蓝图", signals.hasBlueprint),
      ];
    case 3:
      return [
        task("expand-first", "扩写至少 1 个子节", signals.expandedOutlineCount >= 1),
        task("expand-blueprint", "蓝图与大纲保持一致", signals.hasBlueprint && signals.outlineChars >= 80),
      ];
    case 4: {
      const ratio = signals.totalCoreSections > 0
        ? signals.filledCoreSections / signals.totalCoreSections
        : 0;
      return [
        task("draft-start", "开始撰写核心章节", ratio >= 0.2),
        task("draft-all", "完成全部核心章节", ratio >= 1),
      ];
    }
    case 5:
      return [
        task("cite-count", "参考文献不少于 3 篇", signals.referenceCount >= 3),
        task("cite-body", "正文引用编号已核对", signals.filledCoreSections >= Math.ceil(signals.totalCoreSections * 0.5)),
      ];
    case 6:
      return [
        task("abstract-write", "撰写摘要（≥80 字）", signals.abstractChars >= 80),
      ];
    case 7:
      return [
        task("review-run", "运行至少 1 次论文审查", signals.reviewDoneCount >= 1),
        task("review-round2", "完成第 2 轮审查（可选）", signals.reviewDoneCount >= 2),
      ];
    default:
      return [];
  }
}

export function countPendingTasks(tasks: PhaseTask[]): number {
  return tasks.filter((t) => t.status === "pending").length;
}

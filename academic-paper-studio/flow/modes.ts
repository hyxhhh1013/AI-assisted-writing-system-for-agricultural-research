/**
 * 10 种运行模式 — 对齐 academic-paper/references/mode_selection_guide.md
 * 文案面向实验室学生（无计算机背景）
 */

import type { OperationalMode, StudioPhase } from "./types";

export interface ModeDefinition {
  id: OperationalMode;
  /** 学生可见短标题 */
  title: string;
  /** 一句话说明 */
  blurb: string;
  /** 什么时候选 */
  when: string;
  /** 预计产出 */
  output: string;
  /** 预计耗时感 */
  duration: string;
  /** 是否推荐新手 */
  beginnerFriendly: boolean;
  /** 该模式会跑哪些阶段 */
  phases: StudioPhase[];
  /** 是否走简化 3 问 intake */
  simplifiedIntake: boolean;
}

export const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    id: "plan",
    title: "一步步想清楚",
    blurb: "还没想明白写什么？先跟着提问把每一章想清楚，再动笔。",
    when: "第一次写论文、题目还模糊、想先理清思路",
    output: "章节计划 + 关键洞察（INSIGHT）",
    duration: "中等（多轮对话）",
    beginnerFriendly: true,
    phases: [0, 2, 3],
    simplifiedIntake: true,
  },
  {
    id: "full",
    title: "写完整篇论文",
    blurb: "从配置 → 文献 → 结构 → 论证 → 正文 → 引用/摘要 → 审稿 → 排版，完整走一遍。",
    when: "研究问题已经比较清楚，手上有部分材料",
    output: "完整初稿 + 参考文献 + 双语摘要 + 审稿意见",
    duration: "较长（全部 8 个阶段）",
    beginnerFriendly: true,
    phases: [0, 1, 2, 3, 4, 5, 6, 7],
    simplifiedIntake: false,
  },
  {
    id: "outline-only",
    title: "只要论文大纲",
    blurb: "先做出结构与字数分配，方便交给导师看。",
    when: "只需要大纲 / 开题结构，暂不写正文",
    output: "详细大纲 + 证据对应表",
    duration: "较短（阶段 0–2）",
    beginnerFriendly: true,
    phases: [0, 1, 2],
    simplifiedIntake: false,
  },
  {
    id: "lit-review",
    title: "文献综述整理",
    blurb: "系统检索、筛选文献，并写成带注释的文献清单与综述。",
    when: "主要任务是把文献读透、理清研究空白",
    output: "带注释文献表 + 综述综合",
    duration: "中等（阶段 0–1）",
    beginnerFriendly: false,
    phases: [0, 1],
    simplifiedIntake: false,
  },
  {
    id: "abstract-only",
    title: "只写摘要",
    blurb: "单独生成中英文摘要与关键词。",
    when: "正文已有雏形，只差摘要",
    output: "双语摘要 + 5–7 个关键词",
    duration: "短",
    beginnerFriendly: false,
    phases: [0, 5],
    simplifiedIntake: false,
  },
  {
    id: "revision",
    title: "按意见改稿",
    blurb: "已有初稿，根据审稿意见修订（最多两轮）。",
    when: "收到导师/审稿人意见，需要系统修改",
    output: "修订稿 + 修改对照",
    duration: "中等",
    beginnerFriendly: false,
    phases: [6, 4, 5],
    simplifiedIntake: false,
  },
  {
    id: "revision-coach",
    title: "解析审稿意见",
    blurb: "把杂乱的审稿意见整理成可执行的修订路线图。",
    when: "刚收到一堆意见，不知从何改起",
    output: "修订路线图 + 回信骨架",
    duration: "短",
    beginnerFriendly: true,
    phases: [6],
    simplifiedIntake: false,
  },
  {
    id: "citation-check",
    title: "检查引用格式",
    blurb: "核对正文引用与参考文献是否一一对应、格式是否正确。",
    when: "投稿前专项检查引用",
    output: "引用错误报告",
    duration: "短",
    beginnerFriendly: false,
    phases: [5],
    simplifiedIntake: false,
  },
  {
    id: "format-convert",
    title: "转换排版格式",
    blurb: "把文稿转成 Word / LaTeX / PDF，或更换引用格式。",
    when: "内容已定，只差按期刊要求排版",
    output: "排版完成的文稿包",
    duration: "短",
    beginnerFriendly: false,
    phases: [7],
    simplifiedIntake: false,
  },
  {
    id: "disclosure",
    title: "生成 AI 使用声明",
    blurb: "按目标期刊要求写 AI 工具使用披露说明。",
    when: "投稿前需要填写 AI disclosure",
    output: "期刊对应的披露段落",
    duration: "很短",
    beginnerFriendly: false,
    phases: [7],
    simplifiedIntake: false,
  },
];

export function getMode(id: OperationalMode): ModeDefinition {
  const found = MODE_DEFINITIONS.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown mode: ${id}`);
  return found;
}

/** 新手首页优先展示的模式 */
export const BEGINNER_MODE_IDS: OperationalMode[] = ["plan", "full", "outline-only"];

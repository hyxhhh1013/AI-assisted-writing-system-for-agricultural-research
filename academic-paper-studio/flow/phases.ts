/**
 * Phase 0–7 定义 — 严格对齐 academic-paper/references/workflow_phase_details.md
 * 学生文案：避免英文缩写堆砌，必要时括号注明
 */

import type { StudioPhase } from "./types";

export interface PhaseTrack {
  id: "5a" | "5b";
  title: string;
  agentLabel: string;
  output: string;
  studentTasks: string[];
}

export interface PhaseDefinition {
  id: StudioPhase;
  /** skill 英文代号 */
  code: string;
  /** 学生可见标题 */
  title: string;
  /** 一句话 */
  blurb: string;
  /** 对应 agent（内部，不对学生强调） */
  agent: string;
  /** 本阶段产出物 */
  outputs: string[];
  /** 学生需要做的事（白话） */
  studentTasks: string[];
  /** 检查点说明；null 表示无强制确认 */
  checkpoint: string | null;
  /** Phase 5 并行轨 */
  parallelTracks?: PhaseTrack[];
}

export const PHASE_DEFINITIONS: PhaseDefinition[] = [
  {
    id: 0,
    code: "CONFIG",
    title: "填写论文设置",
    blurb: "先把论文类型、字数、引用格式等基本信息填清楚，后面所有步骤都按这份设置来。",
    agent: "intake_agent",
    outputs: ["论文配置记录（Paper Configuration Record）"],
    studentTasks: [
      "回答向导里的问题（题目、类型、目标期刊等）",
      "核对系统生成的「配置记录」",
      "确认无误后再进入下一阶段（铁律：未确认不能继续）",
    ],
    checkpoint: "必须确认「论文配置记录」后才能进入文献阶段",
  },
  {
    id: 1,
    code: "RESEARCH",
    title: "收集与筛选文献",
    blurb:
      "不必一篇篇手打。可以检索导入，也可以先写正文、扩写时再勾选文献。最后在「核对引用」阶段统一清理。",
    agent: "literature_strategist_agent",
    outputs: ["检索策略", "文献库 / 带注释文献表", "文献×主题矩阵", "研究空白图"],
    studentTasks: [
      "优先用「检索并导入」：OpenAlex / PubMed 或知识库 PDF",
      "若还没想清楚文献：可跳过本步，去扩写时点「检索」再补",
      "综述类论文建议先攒一批核心文献再写；实验论文可边写 Results 边补",
    ],
    checkpoint: "建议过目文献清单；赶时间或资料不足时可跳过，后面再补",
  },
  {
    id: 2,
    code: "ARCHITECTURE",
    title: "设计论文结构",
    blurb: "选定论文骨架（如 IMRaD），给出各节大纲与字数分配，并把证据对应到章节。",
    agent: "structure_architect_agent",
    outputs: ["详细大纲", "字数分配", "证据→章节对照表"],
    studentTasks: [
      "查看推荐结构是否适合你的研究",
      "调整章节顺序或字数",
      "批准大纲后才能进入论证阶段（铁律）",
    ],
    checkpoint: "必须批准大纲后才能进入论证构建",
  },
  {
    id: 3,
    code: "ARGUMENTATION",
    title: "理清论证逻辑",
    blurb: "写出中心论点、分论点，以及「主张—证据—推理」链条，并预想可能的反驳。",
    agent: "argument_builder_agent",
    outputs: ["论证蓝图（Argument Blueprint）", "主张—证据—推理链", "反驳策略"],
    studentTasks: [
      "检查每条主张是否有证据支撑",
      "标出你觉得牵强的地方，请助手改写",
    ],
    checkpoint: null,
  },
  {
    id: 4,
    code: "DRAFTING",
    title: "逐段撰写正文",
    blurb: "按大纲与论证蓝图分段写作，控制学术语气与字数，并嵌入文内引用。",
    agent: "draft_writer_agent",
    outputs: ["完整初稿（分节）", "各节字数追踪"],
    studentTasks: [
      "按章节审读生成内容",
      "用实验室真实数据替换占位描述",
      "不满意的段落可要求重写该节",
    ],
    checkpoint: null,
  },
  {
    id: 5,
    code: "CITATIONS + ABSTRACT",
    title: "核对引用 + 写摘要",
    blurb: "这两件事可以同时进行：一边核对引用格式，一边写中英文摘要与关键词。",
    agent: "citation_compliance_agent + abstract_bilingual_agent",
    outputs: ["引用核查报告", "中英文摘要", "关键词（各 5–7 个）"],
    studentTasks: [
      "看引用报告：正文与参考文献是否一一对应",
      "确认 DOI / 链接是否齐全",
      "审读双语摘要是否准确（不是机械互译）",
    ],
    checkpoint: null,
    parallelTracks: [
      {
        id: "5a",
        title: "核对引用",
        agentLabel: "citation_compliance_agent",
        output: "引用核查报告",
        studentTasks: [
          "消灭「正文有、列表无」或反过来的孤儿引用",
          "确认所选引用格式（APA / IEEE 等）一致",
        ],
      },
      {
        id: "5b",
        title: "写双语摘要",
        agentLabel: "abstract_bilingual_agent",
        output: "双语摘要 + 关键词",
        studentTasks: [
          "英文摘要约 150–300 词",
          "中文摘要约 300–500 字",
          "关键词各 5–7 个",
        ],
      },
    ],
  },
  {
    id: 6,
    code: "PEER REVIEW",
    title: "模拟同行审稿",
    blurb: "按五个维度打分，给出可执行修改建议。严重问题未解决前不能进入最终排版。",
    agent: "peer_reviewer_agent",
    outputs: ["五维审稿报告", "修订建议", "裁决（接收 / 小修 / 大修 / 拒稿）"],
    studentTasks: [
      "阅读每条意见与建议改法",
      "按建议回到撰写阶段修改（最多 2 轮）",
      "无法解决的问题记入「已知局限」",
    ],
    checkpoint: "存在未解决的严重（Critical）问题时，禁止进入排版阶段；修订最多 2 轮",
  },
  {
    id: 7,
    code: "FORMAT",
    title: "排版与导出",
    blurb: "按目标格式导出，附上作者贡献、资助、伦理、数据可用性与 AI 使用声明。",
    agent: "formatter_agent",
    outputs: [
      "最终文稿包（Markdown / Word / LaTeX / PDF）",
      "投稿信（如需要）",
      "AI 使用声明与必备声明清单",
    ],
    studentTasks: [
      "选择导出格式",
      "核对 CRediT 作者贡献、资助、伦理、利益冲突声明",
      "下载文稿并交给导师审阅",
    ],
    checkpoint: null,
  },
];

export function getPhase(id: StudioPhase): PhaseDefinition {
  const found = PHASE_DEFINITIONS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown phase: ${id}`);
  return found;
}

/** 五维审稿权重 — peer_reviewer_agent */
export const REVIEW_DIMENSIONS = [
  { id: "originality", title: "创新性", weight: 0.2 },
  { id: "method", title: "方法严谨性", weight: 0.25 },
  { id: "evidence", title: "证据充分性", weight: 0.25 },
  { id: "argument", title: "论证连贯性", weight: 0.15 },
  { id: "writing", title: "写作质量", weight: 0.15 },
] as const;

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

export type PhaseGateResult =
  | { ok: true }
  | { ok: false; error: string };

const MIN_OUTLINE_CHARS = 40;
const MIN_BODY_CHARS_FOR_ABSTRACT = 80;

function outlineReady(project: AgentProjectSnapshot): boolean {
  return project.outline.trim().length >= MIN_OUTLINE_CHARS;
}

function hasBodyDraft(project: AgentProjectSnapshot): boolean {
  return project.sectionFills.some(
    (s) => s.key !== "abstract" && s.chars >= MIN_BODY_CHARS_FOR_ABSTRACT,
  );
}

/**
 * Passport / 产品阶段门禁：在工具执行前拦截明显不合阶段的动作。
 * 失败应作为 observation 返回，让 Agent 改道，而不是整次任务硬中止。
 */
export function checkAgentToolPhaseGate(
  toolName: string,
  params: Record<string, unknown>,
  project: AgentProjectSnapshot | null | undefined,
): PhaseGateResult {
  const writeTools = new Set([
    "write_section",
    "refine_content",
    "build_argument_blueprint",
    "write_bilingual_abstract",
  ]);

  if (!writeTools.has(toolName)) {
    return { ok: true };
  }

  if (!project) {
    return {
      ok: false,
      error: `${toolName} 需要绑定论文项目；请先打开工作台项目后再试`,
    };
  }

  const phase = project.currentPhase;

  if (toolName === "write_bilingual_abstract") {
    if (!hasBodyDraft(project)) {
      return {
        ok: false,
        error:
          "双语摘要需要先有正文草稿。请先写引言等方法/结果章节，再调用 write_bilingual_abstract",
      };
    }
    return { ok: true };
  }

  if (toolName === "build_argument_blueprint") {
    if (!outlineReady(project)) {
      return {
        ok: false,
        error:
          "论证蓝图需要先有可用大纲（建议≥40字）。请先去提纲 Tab 生成大纲，或让用户补充大纲后再调用 build_argument_blueprint",
      };
    }
    if (phase != null && phase < 3) {
      return {
        ok: false,
        error:
          "Passport 尚未进入论证阶段（需先完成文献与结构）。请先生成大纲与写作蓝图",
      };
    }
    return { ok: true };
  }

  if (toolName === "write_section" || toolName === "refine_content") {
    if (!outlineReady(project)) {
      return {
        ok: false,
        error:
          "尚未生成足够大纲，不能写章节正文。请先完成提纲（Phase 2），再调用 write_section；可先用 search_knowledge 检索文献",
      };
    }

    // 阶段任务包：起草前应先过结构；论证阶段优先论证蓝图
    if (phase != null && phase < 4) {
      if (phase <= 2) {
        return {
          ok: false,
          error:
            "当前处于结构阶段：请先在提纲 Tab 完成大纲与写作蓝图，Passport 进入起草后再写正文",
        };
      }
      if (phase === 3 && !project.hasArgumentBlueprint) {
        return {
          ok: false,
          error:
            "当前处于论证阶段：请先调用 build_argument_blueprint 生成论证蓝图，再起草正文",
        };
      }
    }

    const section = String(params.section ?? "").trim();
    if (toolName === "write_section" && section === "abstract" && !hasBodyDraft(project)) {
      return {
        ok: false,
        error:
          "摘要应在有正文后再写。请先写引言/方法/结果等章节，再调用 write_section(section=abstract)",
      };
    }

    return { ok: true };
  }

  return { ok: true };
}

/** 写入系统提示的门禁摘要 */
export function phaseGatePromptRules(): string {
  return `阶段门禁（违反会被工具拒绝，请改道）：
- 严格遵循【阶段任务包】推荐工具，不要跳阶段
- Phase≤2：禁止 write_section；先大纲+写作蓝图
- Phase=3：优先 build_argument_blueprint，无论证蓝图禁止硬写正文
- 无正文草稿时禁止 abstract / write_bilingual_abstract
- Phase 5：必须用 validate_citations；越界引用编号不可标「可过稿」/导出
- 每次优先完成当前阶段目标，再进入下一阶段`;
}

import { userAskedToRegenerateOutline } from "@/lib/agent/entry-route";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { isOutlineReady } from "@/lib/outline-threshold";

export type PhaseGateResult =
  | { ok: true }
  | { ok: false; error: string };

const MIN_BODY_CHARS_FOR_ABSTRACT = 80;

function outlineReady(project: AgentProjectSnapshot): boolean {
  return isOutlineReady(project.outline);
}

function hasBodyDraft(project: AgentProjectSnapshot): boolean {
  return project.sectionFills.some(
    (s) => s.key !== "abstract" && s.chars >= MIN_BODY_CHARS_FOR_ABSTRACT,
  );
}

/**
 * 前置条件门禁（对齐 academic-paper）：缺大纲时先问用户，缺蓝图写回后必须等人批准。
 * 失败作为 observation 返回，让 Agent 改道调用 generate_*。
 */
export function checkAgentToolPhaseGate(
  toolName: string,
  params: Record<string, unknown>,
  project: AgentProjectSnapshot | null | undefined,
  opts?: { configApproved?: boolean; userGoal?: string },
): PhaseGateResult {
  const structureTools = new Set([
    "generate_outline",
    "generate_writing_blueprint",
  ]);
  if (structureTools.has(toolName)) {
    if (!project) {
      return {
        ok: false,
        error: `${toolName} 需要绑定论文项目；请先打开工作台项目后再试`,
      };
    }
    if (!project.hasPaperConfig && !opts?.configApproved) {
      return {
        ok: false,
        error:
          "论文配置还没确认。请先让用户完成配置问答（题目、类型、语言、引用格式、篇幅），不要生成大纲或写作蓝图。",
      };
    }
    if (
      toolName === "generate_outline"
      && project.agentEntryMode === "outline_ready"
      && !userAskedToRegenerateOutline(opts?.userGoal ?? "")
    ) {
      return {
        ok: false,
        error:
          "已有大纲入口：用户没要求重做、大改或生成大纲时不要 generate_outline。请让用户把提纲贴进项目，或 read_project_asset(outline)；缺蓝图再 generate_writing_blueprint。",
      };
    }
    if (toolName === "generate_writing_blueprint" && !outlineReady(project)) {
      return {
        ok: false,
        error:
          "写作蓝图需要先有大纲。请先调用 generate_outline，再调用 generate_writing_blueprint",
      };
    }
    return { ok: true };
  }

  const writeTools = new Set([
    "write_section",
    "refine_content",
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

  if (toolName === "write_bilingual_abstract") {
    if (!hasBodyDraft(project)) {
      return {
        ok: false,
        error:
          "双语摘要需要先有正文草稿。请先 write_section 写引言等方法/结果，再调用 write_bilingual_abstract",
      };
    }
    return { ok: true };
  }

  if (toolName === "write_section" || toolName === "refine_content") {
    if (!outlineReady(project)) {
      if (project.agentEntryMode === "outline_ready") {
        return {
          ok: false,
          error:
            "尚未有可用大纲。请让用户把已有提纲贴进项目后再写。用户没要求重做时不要 generate_outline。",
        };
      }
      return {
        ok: false,
        error:
          "尚未有可用大纲。请先调用 generate_outline → generate_writing_blueprint，再 write_section",
      };
    }

    if (!project.hasWritingBlueprint) {
      return {
        ok: false,
        error:
          "尚无写作蓝图。请先调用 generate_writing_blueprint，再起草正文（论证要点已含在写作蓝图各节 claim/evidenceHint 中）",
      };
    }

    const section = String(params.section ?? "").trim();
    if (
      toolName === "write_section"
      && section === "results"
      && project.mode === "research"
      && project.dataClaims.length === 0
    ) {
      return {
        ok: false,
        error:
          "结果章需要证据声明。请先 ingest_project_data 导入表格，或请用户明确本稿先不写定量结果。不要编造数值。",
      };
    }
    if (
      toolName === "write_section"
      && section === "introduction"
      && project.agentEntryMode === "data_ready"
      && project.mode === "research"
    ) {
      const charsOf = (key: string) =>
        project.sectionFills.find((s) => s.key === key)?.chars ?? 0;
      if (charsOf("methods") < 80 && charsOf("results") < 80) {
        return {
          ok: false,
          error:
            "已有数据入口要先写方法与结果，再写引言。请 write_section(section=methods)。",
        };
      }
    }
    if (toolName === "write_section" && section === "abstract" && !hasBodyDraft(project)) {
      return {
        ok: false,
        error:
          "摘要应在有正文后再写。请先写引言/方法/结果等章节，再调用 write_section(section=abstract) 或 write_bilingual_abstract",
      };
    }

    return { ok: true };
  }

  return { ok: true };
}

/** 写入系统提示的门禁摘要 */
export function phaseGatePromptRules(): string {
  return `阶段策略（缺信息就问用户；每轮只交付一个可见结果）：
- 用 inspect_project 了解当前阶段与空白章节，再决定工具
- 主路径：论文配置确认 → 大纲（写回后等人批准）→ 写作蓝图（写回后等人批准）→ 一次写一节 → 摘要/核查
- 论文配置没确认时，禁止 generate_outline / generate_writing_blueprint
- 写章节若缺大纲：先问用户「出一版」还是贴骨架，不要静默生成
- 无正文时不要写摘要 / write_bilingual_abstract
- 引用以 validate_citations 为准；不编造文献
- 审查最多 2 轮；满轮后总结问题并征求用户是否继续改
- 项目简报里的「路线」优先于上面的默认主路径`;
}

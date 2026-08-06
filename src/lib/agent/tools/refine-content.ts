import prisma from "@/lib/prisma";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { runAgentRefineContent } from "@/lib/agent/writing-runner";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { isSectionValidForMode } from "@/lib/section-registry";

/**
 * P0 防数据丢失：读取项目内章节的权威当前内容。
 * refine_content 写回时必须以「项目现有整节」为 Refiner 底稿，
 * 不能信任模型传入的 draftText 片段——片段会被整节覆盖（曾致 introduction 2517→111 字）。
 */
async function readStoredSectionContent(
  userId: string,
  projectId: string,
  sectionKey: string,
): Promise<string> {
  if (sectionKey === "abstract") {
    const p = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { abstract: true },
    });
    return p?.abstract?.trim() ?? "";
  }
  const s = await prisma.section.findUnique({
    where: { projectId_key: { projectId, key: sectionKey } },
    select: { content: true },
  });
  return s?.content?.trim() ?? "";
}

export const refineContentTool: ToolDefinition = {
  name: "refine_content",
  description:
    "根据核查意见或人工反馈修正已有正文（Refiner 管线，fix_only 模式）。提供 section 且写回项目时，自动读取项目当前整节内容作为修正底稿，draftText 可省略；Refiner 输出为整节替换文本。",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "可选：修正后写回的项目章节 key",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      draftText: {
        type: "string",
        description:
          "可选（提供 section 且写回时自动读取项目当前内容，此字段被忽略；仅无 section 的纯返回模式必填）：待修正正文。不要传片段——写回时整节都会被替换",
      },
      feedback: {
        type: "string",
        description: "Verifier 报告或人工修改意见",
      },
      contextText: {
        type: "string",
        description: "可选：支撑该段落的检索上下文或文献摘要",
      },
      persistToProject: {
        type: "string",
        description: "是否写回项目（默认 true；传 false 仅返回修正稿）",
      },
    },
    required: ["draftText", "feedback"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    const draftText = String(params.draftText ?? "").trim();
    const feedback = String(params.feedback ?? "").trim();
    if (!feedback) {
      return { success: false, error: "feedback 不能为空" };
    }

    const sectionRaw = params.section ? String(params.section).trim() : "";
    const persistToProject = parsePersistToProject(params.persistToProject);

    if (persistToProject && !ctx.projectId) {
      return { success: false, error: "写回项目需要 projectId" };
    }
    if (persistToProject && sectionRaw && !isAgentWritingSectionKey(sectionRaw)) {
      return { success: false, error: `无效章节: ${sectionRaw}` };
    }
    if (persistToProject && !sectionRaw) {
      return {
        success: false,
        error: "persistToProject 为 true 时必须提供 section",
      };
    }

    let projectMode: "review" | "research" | undefined;
    let maxRefIndex = 0;
    if (ctx.projectId) {
      const project = await getAgentProjectSnapshot(ctx);
      if (!project) {
        return { success: false, error: "项目不存在或无权访问" };
      }
      projectMode = project.mode;
      maxRefIndex = project.references.length;
      if (sectionRaw && !isSectionValidForMode(sectionRaw, project.mode)) {
        return {
          success: false,
          error: `章节 ${sectionRaw} 与项目类型 ${project.mode} 不匹配`,
        };
      }
    }

    const contextText = String(params.contextText ?? "").trim();

    // P0 防覆盖：写回项目时以「项目当前整节」为权威 Refiner 底稿。
    // 模型传片段（几百字）是常犯错误，直接整节覆盖会丢正文。
    let draft = draftText;
    let authoritativeLen = 0;
    if (persistToProject && ctx.projectId && sectionRaw) {
      const stored = await readStoredSectionContent(
        ctx.userId,
        ctx.projectId,
        sectionRaw,
      );
      if (stored) {
        authoritativeLen = stored.length;
        draft = stored;
      }
    }
    if (!draft) {
      return {
        success: false,
        error: "draftText 不能为空（且项目内该章节暂无内容可修正）",
      };
    }

    try {
      const result = await runAgentRefineContent({
        draft,
        feedback,
        contextText,
        maxRefIndex,
        projectMode,
        userId: ctx.userId,
        signal: ctx.signal,
      });

      // 防御兜底：权威底稿很长而 Refiner 输出骤减 → 判为异常，放弃写回避免二次覆盖
      if (
        persistToProject
        && sectionRaw
        && authoritativeLen > 200
        && result.draft.length < authoritativeLen * 0.4
      ) {
        return {
          success: false,
          error:
            `Refiner 输出异常过短（${result.draft.length} 字 vs 原文 ${authoritativeLen} 字），`
            + "已放弃写回以免覆盖。请检查反馈是否只描述了少量修改，或重试。",
        };
      }

      let persisted: { sectionKey: string; referencesAdded: number } | undefined;
      if (persistToProject && ctx.projectId && sectionRaw) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionRaw,
          result.draft,
        );
      }

      return {
        success: true,
        data: {
          section: sectionRaw || undefined,
          draft: result.draft,
          charCount: result.charCount,
          persisted: persisted ?? null,
        },
        summary: persisted
          ? `已修正并写回 ${sectionRaw}（${result.charCount} 字）`
          : `已修正正文（${result.charCount} 字）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

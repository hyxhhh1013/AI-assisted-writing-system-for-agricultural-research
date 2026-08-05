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

export const refineContentTool: ToolDefinition = {
  name: "refine_content",
  description:
    "根据核查意见或人工反馈修正已有正文（Refiner 管线，fix_only 模式）",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "可选：修正后写回的项目章节 key",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      draftText: { type: "string", description: "待修正正文" },
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
    if (!draftText) {
      return { success: false, error: "draftText 不能为空" };
    }
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

    try {
      const result = await runAgentRefineContent({
        draft: draftText,
        feedback,
        contextText,
        maxRefIndex,
        projectMode,
        userId: ctx.userId,
        signal: ctx.signal,
      });

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

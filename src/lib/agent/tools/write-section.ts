import { resolveWritingDraftContext } from "@/contracts/writing";
import { loadAgentProject } from "@/lib/agent/project-loader";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { runAgentWriteSection } from "@/lib/agent/writing-runner";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { getAgentModelConfig } from "@/lib/ai";
import { isSectionValidForMode } from "@/lib/section-registry";
import type { WritingInput } from "@/lib/validations";

export const writeSectionTool: ToolDefinition = {
  name: "write_section",
  description:
    "调用 Writer 扩写管道为指定章节生成正文（含 RAG 检索；默认 fast 模式，可选 full 含 Verifier+Refiner）",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "论文章节 key，如 introduction、methods、literature_body",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      context: { type: "string", description: "扩写要点或补充说明" },
      bullets: {
        type: "string",
        description: "JSON 数组字符串，扩写要点列表（优先于 context）",
      },
      pipelineMode: {
        type: "string",
        description: "fast（仅 Writer）或 full（Writer+Verifier+Refiner）",
        enum: ["fast", "full"],
      },
      subsectionTitle: { type: "string", description: "可选：子节标题" },
      persistToProject: {
        type: "string",
        description: "是否写回项目章节与新增参考文献（默认 true）",
      },
    },
    required: ["section", "context"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "write_section 需要关联 projectId" };
    }

    const sectionRaw = String(params.section ?? "").trim();
    if (!isAgentWritingSectionKey(sectionRaw)) {
      return { success: false, error: `无效章节: ${sectionRaw}` };
    }

    const persistToProject = parsePersistToProject(params.persistToProject);

    const project = await loadAgentProject(ctx.userId, ctx.projectId);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    if (!isSectionValidForMode(sectionRaw, project.mode)) {
      return {
        success: false,
        error: `章节 ${sectionRaw} 与项目类型 ${project.mode} 不匹配`,
      };
    }

    let bullets: string[] | undefined;
    if (params.bullets) {
      try {
        const parsed = JSON.parse(String(params.bullets)) as unknown;
        if (Array.isArray(parsed)) {
          bullets = parsed.map((b) => String(b));
        }
      } catch {
        return { success: false, error: "bullets 必须是 JSON 数组字符串" };
      }
    }

    const context = String(params.context ?? "").trim();
    const draftContext = resolveWritingDraftContext(context, bullets);
    if (!draftContext.trim()) {
      return { success: false, error: "context 或 bullets 不能为空" };
    }

    const { keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return { success: false, error: keyError };
    }

    const pipelineMode = params.pipelineMode === "full" ? "full" : "fast";
    const data: WritingInput = {
      title: project.title,
      section: sectionRaw,
      context,
      bullets,
      language: project.language,
      template: project.template as WritingInput["template"],
      existingReferences: project.references,
      globalContext: project.globalContext,
      mode: pipelineMode,
      retrievalMode: "balanced",
      researchDirection: project.researchDirection,
      projectMode: project.mode,
      citationStyle: project.citationStyle,
      subsectionTitle: params.subsectionTitle
        ? String(params.subsectionTitle)
        : undefined,
      dataClaims: project.dataClaims,
    };

    try {
      const result = await runAgentWriteSection({
        data,
        context: draftContext,
        dataClaims: project.dataClaims,
        globalContext: project.globalContext,
        userId: ctx.userId,
        signal: ctx.signal,
      });

      if (!result.draft) {
        return { success: false, error: "Writer 未返回正文" };
      }

      let persisted: { sectionKey: string; referencesAdded: number } | undefined;
      if (persistToProject) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionRaw,
          result.draft,
          result.references,
        );
      }

      return {
        success: true,
        data: {
          section: sectionRaw,
          draft: result.draft,
          charCount: result.draft.length,
          newReferences: result.references,
          pipelineMode: result.pipelineMode,
          verification: result.verification,
          citationWarnings: result.citationWarnings,
          persisted: persisted ?? null,
        },
        summary: persisted
          ? `已生成并写回 ${sectionRaw}（${result.draft.length} 字，${result.pipelineMode}）`
          : `已生成 ${sectionRaw}（${result.draft.length} 字，${result.pipelineMode} 模式）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

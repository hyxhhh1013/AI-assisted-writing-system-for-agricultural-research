import { resolveWritingDraftContext } from "@/contracts/writing";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";
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
    "调用 Writer 扩写管道为指定章节生成正文（含 RAG；默认写后自动核查修正一轮，可关）",
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
        description: "fast（仅 Writer）或 full（Writer+Verifier+Refiner）；与 autoFix 叠加时 full 优先",
        enum: ["fast", "full"],
      },
      autoFix: {
        type: "string",
        description: "写后自动核查并修正（默认 true；false 关闭）。对应 AGENT_WRITE_AUTO_FIX",
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

    const project = await getAgentProjectSnapshot(ctx);
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
    const autoFixRaw = params.autoFix;
    const autoFix =
      autoFixRaw === false || autoFixRaw === "false" || autoFixRaw === "0"
        ? false
        : autoFixRaw === true || autoFixRaw === "true" || autoFixRaw === "1"
          ? true
          : undefined;

    // 确保 writer 能看到完整大纲（blueprint 的 globalContext 可能缺 outline，
    // 大纲缺失会导致只写 Agent 传入的 bullets 子节、漏掉其它大纲子节）
    const globalContext = {
      ...(project.globalContext ?? {}),
      outline: project.outline || project.globalContext?.outline || undefined,
    };

    const data: WritingInput = {
      title: project.title,
      section: sectionRaw,
      context,
      bullets,
      language: project.language,
      template: project.template as WritingInput["template"],
      existingReferences: project.references,
      referenceEvidence: project.referenceEvidence ?? [],
      globalContext,
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

    const progressState = createWriteProgressState();

    try {
      const result = await runAgentWriteSection({
        data,
        context: draftContext,
        dataClaims: project.dataClaims,
        globalContext,
        userId: ctx.userId,
        signal: ctx.signal,
        autoFix,
        onWritingEvent: (event) => {
          const progress = translateWritingEventToProgress(sectionRaw, event, progressState);
          if (progress) {
            ctx.emitLiveEvent?.({ type: "agent/progress", label: progress.label });
          }
        },
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

      const fixNote =
        result.pipelineMode === "full"
          ? result.issueCount > 0
            ? `，自动核查后已按 ${result.issueCount} 条意见修正`
            : "，自动核查通过"
          : "";

      return {
        success: true,
        data: {
          section: sectionRaw,
          draft: result.draft,
          charCount: result.draft.length,
          newReferences: result.references,
          pipelineMode: result.pipelineMode,
          verification: result.verification,
          issueCount: result.issueCount,
          citationWarnings: result.citationWarnings,
          persisted: persisted ?? null,
        },
        summary: persisted
          ? `已生成并写回 ${sectionRaw}（${result.draft.length} 字${fixNote}）`
          : `已生成 ${sectionRaw}（${result.draft.length} 字，${result.pipelineMode}${fixNote}）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

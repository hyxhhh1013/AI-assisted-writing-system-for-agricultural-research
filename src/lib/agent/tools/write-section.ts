import type { AgentActiveWrite } from "@/contracts/agent-session";
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
import {
  ACTIVE_WRITE_PATCH_MIN_MS,
  applyWritingEventToDraftAcc,
  buildWriteAttemptKey,
  clipActiveWriteDraft,
  evaluateWriteResume,
} from "@/lib/agent/write-resume";
import {
  listBlueprintSubsectionPathsForKey,
  prepareAgentWriteBlueprintContext,
} from "@/lib/agent/blueprint-write-context";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  assessDataFoundation,
  resultsWriteBlockMessage,
  shouldBlockResultsWrite,
} from "@/lib/agent/data-foundation";
import { loadAgentPlotSources } from "@/lib/agent/plot-sources";
import { getAgentModelConfig } from "@/lib/ai";
import { isSectionValidForMode } from "@/lib/section-registry";
import type { WritingInput } from "@/lib/validations";

export const writeSectionTool: ToolDefinition = {
  name: "write_section",
  description:
    "调用 Writer 扩写管道为指定章节生成正文（含 RAG；默认写后自动核查修正一轮，可关）。有写作蓝图时系统会自动注入该节 purpose/keyPoints/配图；context/bullets 须对齐蓝图要点，勿另起炉灶。"
    + "综述 literature_body：蓝图有多个子节时必须带 subsectionTitle 逐节写，禁止一次写完整章万字。",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "论文章节 key，如 introduction、methods、literature_body",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      context: {
        type: "string",
        description:
          "扩写要点或补充说明；有蓝图时应对齐该节蓝图 purpose/keyPoints（系统也会自动注入本节蓝图）",
      },
      bullets: {
        type: "string",
        description:
          "JSON 数组字符串，扩写要点列表（优先于 context）；有蓝图时优先使用该节 keyPoints",
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
      subsectionTitle: {
        type: "string",
        description:
          "子节标题（建议传蓝图 sectionPath 或末级标题）。literature_body 在蓝图有多子节时必填",
      },
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

    if (shouldBlockResultsWrite(project.mode, sectionRaw, "empty")) {
      const plot = await loadAgentPlotSources(ctx.userId, ctx.projectId);
      const foundation = assessDataFoundation({
        claimCount: project.dataClaims.length,
        sourceCount: plot?.sources.length ?? 0,
        candidateCount: plot?.candidates.length ?? 0,
      });
      if (shouldBlockResultsWrite(project.mode, sectionRaw, foundation.status)) {
        return { success: false, error: resultsWriteBlockMessage() };
      }
    }

    const subsectionTitleEarly = params.subsectionTitle
      ? String(params.subsectionTitle).trim()
      : "";
    // 综述正文：蓝图多子节时禁止一次 write 整章（否则易产出万字、超时/质量塌陷）
    if (sectionRaw === "literature_body" && !subsectionTitleEarly) {
      const subs = listBlueprintSubsectionPathsForKey(
        project.globalContext?.blueprint ?? null,
        "literature_body",
        project.mode,
      );
      if (subs.length >= 2) {
        const preview = subs.slice(0, 6).map((p, i) => `${i + 1}. ${p}`).join("；");
        return {
          success: false,
          error:
            `综述正文请按蓝图子节分批写，不要一次 write_section(literature_body) 写完整章。`
            + `请带 subsectionTitle，例如：${preview}`
            + (subs.length > 6 ? "…" : "")
            + "。每调用一次只写一个子节。",
        };
      }
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

    const pipelineMode = params.pipelineMode === "full" ? "full" : "fast";
    const autoFixRaw = params.autoFix;
    const autoFix =
      autoFixRaw === false || autoFixRaw === "false" || autoFixRaw === "0"
        ? false
        : autoFixRaw === true || autoFixRaw === "true" || autoFixRaw === "1"
          ? true
          : undefined;

    const attemptKey = buildWriteAttemptKey({
      section: sectionRaw,
      context,
      bullets: params.bullets ? String(params.bullets) : undefined,
      pipelineMode,
      autoFix: autoFixRaw as string | boolean | undefined,
      subsectionTitle: params.subsectionTitle
        ? String(params.subsectionTitle)
        : undefined,
    });

    // 断点续写 / 去重：同一次尝试已有足够草稿 → 跳过 AI
    const resume = evaluateWriteResume(ctx.activeWrite, {
      section: sectionRaw,
      context,
      bullets: params.bullets ? String(params.bullets) : undefined,
      pipelineMode,
      autoFix: autoFixRaw as string | boolean | undefined,
      subsectionTitle: params.subsectionTitle
        ? String(params.subsectionTitle)
        : undefined,
    });
    if (resume.action === "reuse") {
      let persisted: { sectionKey: string; referencesAdded: number } | null = null;
      if (persistToProject) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionRaw,
          resume.draft,
          resume.references,
        );
      }
      ctx.activeWrite = null;
      await ctx.patchActiveWrite?.(null);
      return {
        success: true,
        data: {
          section: sectionRaw,
          draft: resume.draft,
          charCount: resume.draft.length,
          newReferences: resume.references,
          pipelineMode: resume.pipelineMode,
          issueCount: 0,
          citationWarnings: 0,
          persisted,
          resumedFrom: resume.resumedFrom,
        },
        summary: resume.summary,
      };
    }

    const { keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return { success: false, error: keyError };
    }

    const subsectionTitle = params.subsectionTitle
      ? String(params.subsectionTitle)
      : undefined;

    // 嵌套 blueprint + 本节蓝图 hint + assignedSources→检索范围（与工作台扩写对齐）
    const {
      globalContext,
      draftContext: draftWithBlueprint,
      selectedSourceIds,
    } = prepareAgentWriteBlueprintContext({
      project,
      sectionKey: sectionRaw,
      draftContext,
      subsectionTitle,
    });

    const data: WritingInput = {
      title: project.title,
      section: sectionRaw,
      context: draftWithBlueprint,
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
      subsectionTitle,
      dataClaims: project.dataClaims,
      ...(selectedSourceIds?.length ? { selectedSourceIds } : {}),
    };

    const progressState = createWriteProgressState();
    const draftAcc = { draft: "", references: [] as string[] };
    const startedAt = Date.now();
    let lastPatchAt = 0;
    let lastStage: string | undefined;

    const toolParams: Record<string, unknown> = {
      section: sectionRaw,
      context,
      ...(params.bullets ? { bullets: String(params.bullets) } : {}),
      pipelineMode,
      ...(autoFixRaw !== undefined ? { autoFix: autoFixRaw } : {}),
      ...(params.subsectionTitle
        ? { subsectionTitle: String(params.subsectionTitle) }
        : {}),
      ...(params.persistToProject !== undefined
        ? { persistToProject: params.persistToProject }
        : {}),
    };

    const buildActive = (
      status: AgentActiveWrite["status"],
      extra?: Partial<AgentActiveWrite>,
    ): AgentActiveWrite => ({
      tool: "write_section",
      attemptKey,
      section: sectionRaw,
      params: toolParams,
      startedAt,
      updatedAt: Date.now(),
      status,
      stage: lastStage,
      draftChars: draftAcc.draft.length,
      draftText: clipActiveWriteDraft(draftAcc.draft),
      pipelineMode,
      references: draftAcc.references,
      ...extra,
    });

    const patchActive = async (status: AgentActiveWrite["status"], force = false) => {
      const now = Date.now();
      if (!force && now - lastPatchAt < ACTIVE_WRITE_PATCH_MIN_MS) return;
      lastPatchAt = now;
      const aw = buildActive(status);
      ctx.activeWrite = aw;
      await ctx.patchActiveWrite?.(aw);
    };

    await patchActive("running", true);

    try {
      const result = await runAgentWriteSection({
        data,
        context: draftWithBlueprint,
        dataClaims: project.dataClaims,
        globalContext,
        userId: ctx.userId,
        signal: ctx.signal,
        autoFix,
        onWritingEvent: (event) => {
          applyWritingEventToDraftAcc(draftAcc, event);
          const progress = translateWritingEventToProgress(sectionRaw, event, progressState);
          if (progress) {
            if (progress.stage) lastStage = progress.stage;
            ctx.emitLiveEvent?.({ type: "agent/progress", ...progress });
          }
          void patchActive("running");
        },
      });

      if (!result.draft) {
        await patchActive("aborted", true);
        return { success: false, error: "Writer 未返回正文" };
      }

      draftAcc.draft = result.draft;
      draftAcc.references = result.references;

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

      const summary = persisted
        ? `已生成并写回 ${sectionRaw}（${result.draft.length} 字${fixNote}）`
        : `已生成 ${sectionRaw}（${result.draft.length} 字，${result.pipelineMode}${fixNote}）`;

      // 保留 completed 断点：刚写完就断线续跑时可去重，不必再烧 AI
      const completed = buildActive("completed", {
        draftText: clipActiveWriteDraft(result.draft),
        draftChars: result.draft.length,
        pipelineMode: result.pipelineMode,
        references: result.references,
        completedSummary: summary,
      });
      ctx.activeWrite = completed;
      await ctx.patchActiveWrite?.(completed);

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
        summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 中断 / 失败：保留已生成草稿供续跑去重
      await patchActive("aborted", true);
      return { success: false, error: message };
    }
  },
};

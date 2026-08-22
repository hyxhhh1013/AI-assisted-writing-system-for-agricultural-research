import type { AgentActiveWrite } from "@/contracts/agent-session";
import type { EvidenceClaim } from "@/contracts/data-source";
import { shouldPersistWritingDraft } from "@/contracts/writing-qa";
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
import {
  compileSectionSpec,
  type CompileSectionSpecResult,
} from "@/lib/agent/section-compiler";
import {
  bindSectionEvidence,
  evidenceUnboundFinding,
  slimReferenceEvidenceForSpec,
  type BindSectionEvidenceResult,
} from "@/lib/agent/evidence-binder";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  assessDataFoundation,
  resultsWriteBlockMessage,
  shouldBlockResultsWrite,
} from "@/lib/agent/data-foundation";
import { loadAgentPlotSources } from "@/lib/agent/plot-sources";
import {
  appendQaNoteToSummary,
  evaluateSectionWritingQa,
} from "@/lib/agent/writing-qa-run";
import { applyWritingPatches } from "@/lib/agent/writing-patches";
import {
  appendPatchNoteToSummary,
  repairSectionDraft,
} from "@/lib/agent/writing-patch-run";
import {
  buildSpecWriterDraft,
  parseWriteSectionSpec,
  type WriteSpecSource,
} from "@/lib/agent/spec-write-context";
import { getAgentModelConfig } from "@/lib/ai";
import { isSectionValidForMode } from "@/lib/section-registry";
import type { WritingInput } from "@/lib/validations";

function bindCompiledSpec(
  compiled: CompileSectionSpecResult | null,
  project: AgentProjectSnapshot,
): BindSectionEvidenceResult | null {
  if (!compiled) return null;
  return bindSectionEvidence({
    spec: compiled.spec,
    referenceEvidence: project.referenceEvidence,
    referenceSourceNames: project.referenceSourceNames,
    references: project.references,
    dataClaims: project.dataClaims,
  });
}

function resolveWriteSpec(
  providedSpec: ReturnType<typeof parseWriteSectionSpec>,
  compiled: CompileSectionSpecResult | null,
  project: AgentProjectSnapshot,
): {
  bind: BindSectionEvidenceResult | null;
  specSource: WriteSpecSource;
  compileSource: CompileSectionSpecResult["source"] | "provided" | "empty";
} {
  if (providedSpec) {
    return {
      bind: bindSectionEvidence({
        spec: providedSpec,
        referenceEvidence: project.referenceEvidence,
        referenceSourceNames: project.referenceSourceNames,
        references: project.references,
        dataClaims: project.dataClaims,
      }),
      specSource: "provided",
      compileSource: "provided",
    };
  }
  if (compiled) {
    return {
      bind: bindCompiledSpec(compiled, project),
      specSource: "compiled",
      compileSource: compiled.source,
    };
  }
  return { bind: null, specSource: "empty", compileSource: "empty" };
}

function extraFromBind(bind: BindSectionEvidenceResult | null) {
  const extra = bind
    ? evidenceUnboundFinding(bind.unboundCardIds, {
        hadBindablePool: bind.hadBindablePool,
      })
    : null;
  return extra ? [extra] : undefined;
}

function qaWithBind(
  text: string,
  sectionKey: string,
  bind: BindSectionEvidenceResult | null,
  maxRefIndex?: number,
  dataClaims?: EvidenceClaim[],
  subsectionTitle?: string,
) {
  return evaluateSectionWritingQa({
    text,
    sectionKey,
    extraFindings: extraFromBind(bind),
    maxRefIndex,
    dataClaims,
    spec: bind?.spec ?? null,
    subsectionTitle,
  });
}

function refCeiling(existing: string[], added?: string[]): number {
  return existing.length + (added?.length ?? 0);
}

export const writeSectionTool: ToolDefinition = {
  name: "write_section",
  description:
    "调用 Writer 扩写管道为指定章节生成正文（含 RAG；默认写后自动核查修正一轮，可关）。主路径是 SectionSpec（可传 sectionSpec，或由蓝图/context 编译）。"
    + "context/bullets 只作适配，勿另起炉灶。综述 literature_body：蓝图有多个子节时必须带 subsectionTitle 逐节写。",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "论文章节 key，如 introduction、methods、literature_body",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      sectionSpec: {
        type: "string",
        description: "SectionSpecV1 JSON。有则作为写节合同；context/bullets 只作补充",
      },
      context: {
        type: "string",
        description:
          "适配说明或旧要点；有 sectionSpec/蓝图时不必填。有蓝图应对齐该节 purpose/keyPoints",
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
    required: ["section"],
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
    const providedSpec = parseWriteSectionSpec(params.sectionSpec);
    if (params.sectionSpec != null && String(params.sectionSpec).trim() && !providedSpec) {
      return { success: false, error: "sectionSpec 不是合法 SectionSpecV1 JSON" };
    }
    const draftContext = resolveWritingDraftContext(context, bullets);

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
      const compiled = providedSpec
        ? null
        : compileSectionSpec({
            sectionKey: sectionRaw,
            subsectionTitle: params.subsectionTitle
              ? String(params.subsectionTitle)
              : undefined,
            context,
            bullets,
            mode: project.mode,
            language: project.language,
            blueprint: project.globalContext?.blueprint ?? null,
            referenceSourceNames: project.referenceSourceNames,
          });
      const { bind } = resolveWriteSpec(providedSpec, compiled, project);
      const maxRefIndex = refCeiling(project.references, resume.references);
      const qa0 = qaWithBind(
        resume.draft,
        sectionRaw,
        bind,
        maxRefIndex,
        project.dataClaims,
        params.subsectionTitle ? String(params.subsectionTitle) : undefined,
      );
      const patched = applyWritingPatches(resume.draft, qa0.findings, {
        maxRefIndex,
        sectionKey: sectionRaw,
      });
      const resumeDraft = patched.draft;
      const qaReport = resumeDraft === resume.draft
        ? qa0
        : qaWithBind(
            resumeDraft,
            sectionRaw,
            bind,
            maxRefIndex,
            project.dataClaims,
            params.subsectionTitle ? String(params.subsectionTitle) : undefined,
          );
      const blocked = !shouldPersistWritingDraft(qaReport);
      let persisted: { sectionKey: string; referencesAdded: number } | null = null;
      if (persistToProject && !blocked) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionRaw,
          resumeDraft,
          resume.references,
        );
      }
      ctx.activeWrite = null;
      await ctx.patchActiveWrite?.(null);
      return {
        success: true,
        data: {
          section: sectionRaw,
          draft: resumeDraft,
          charCount: resumeDraft.length,
          newReferences: resume.references,
          pipelineMode: resume.pipelineMode,
          issueCount: 0,
          citationWarnings: 0,
          persisted,
          resumedFrom: resume.resumedFrom,
          qaReport,
          sectionSpec: bind?.spec ?? providedSpec ?? compiled?.spec ?? null,
          specSource: providedSpec ? "provided" : compiled ? "compiled" : "empty",
          writingPatches: patched.patches,
          blocked: blocked || undefined,
        },
        summary: appendPatchNoteToSummary(
          appendQaNoteToSummary(resume.summary, qaReport),
          { patches: patched.patches, refined: false },
        ),
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
      selectedSourceIds,
    } = prepareAgentWriteBlueprintContext({
      project,
      sectionKey: sectionRaw,
      draftContext: draftContext || context || "（按本节主张扩写）",
      subsectionTitle,
    });

    const compiled = providedSpec
      ? null
      : compileSectionSpec({
          sectionKey: sectionRaw,
          subsectionTitle,
          context,
          bullets,
          mode: project.mode,
          language: project.language,
          blueprint: globalContext.blueprint ?? null,
          selectedSourceIds,
          referenceSourceNames: project.referenceSourceNames,
        });
    const { bind, specSource, compileSource } = resolveWriteSpec(
      providedSpec,
      compiled,
      project,
    );
    const boundSpec = bind?.spec ?? providedSpec ?? compiled?.spec ?? null;
    if (!boundSpec && !draftContext.trim()) {
      return {
        success: false,
        error: "请提供 sectionSpec、context/bullets，或先生成写作蓝图",
      };
    }
    const draftForWriter = boundSpec
      ? buildSpecWriterDraft({
          spec: boundSpec,
          context,
          source: specSource === "provided" ? "provided" : compileSource,
        })
      : context || draftContext;
    const ragIds = bind?.selectedSourceIds?.length
      ? bind.selectedSourceIds
      : selectedSourceIds;
    const writerEvidence = boundSpec
      ? slimReferenceEvidenceForSpec(project.referenceEvidence, boundSpec)
      : (project.referenceEvidence ?? []);

    const data: WritingInput = {
      title: project.title,
      section: sectionRaw,
      context: draftForWriter,
      bullets: undefined,
      language: project.language,
      template: project.template as WritingInput["template"],
      existingReferences: project.references,
      referenceEvidence: writerEvidence,
      globalContext,
      mode: pipelineMode,
      retrievalMode: "balanced",
      researchDirection: project.researchDirection,
      projectMode: project.mode,
      citationStyle: project.citationStyle,
      subsectionTitle,
      dataClaims: project.dataClaims,
      writerProfile: "slim",
      ...(ragIds?.length ? { selectedSourceIds: ragIds } : {}),
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
        context: draftForWriter,
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

      const maxRefIndex = refCeiling(project.references, result.references);
      const repaired = await repairSectionDraft({
        draft: result.draft,
        sectionKey: sectionRaw,
        extraFindings: extraFromBind(bind),
        maxRefIndex,
        userId: ctx.userId,
        signal: ctx.signal,
        projectMode: project.mode,
        allowRefine: autoFix !== false && result.pipelineMode !== "full",
        dataClaims: project.dataClaims,
        spec: boundSpec,
        subsectionTitle,
      });

      draftAcc.draft = repaired.draft;
      const qaReport = repaired.qaReport;
      const blocked = !shouldPersistWritingDraft(qaReport);

      let persisted: { sectionKey: string; referencesAdded: number } | undefined;
      if (persistToProject && !blocked) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionRaw,
          repaired.draft,
          result.references,
        );
      }

      const fixNote =
        result.pipelineMode === "full"
          ? result.issueCount > 0
            ? `，自动核查后已按 ${result.issueCount} 条意见修正`
            : "，自动核查通过"
          : "";

      const summary = appendPatchNoteToSummary(
        appendQaNoteToSummary(
          persisted
            ? `已生成并写回 ${sectionRaw}（${repaired.draft.length} 字${fixNote}）`
            : `已生成 ${sectionRaw}（${repaired.draft.length} 字，${result.pipelineMode}${fixNote}）`,
          qaReport,
        ),
        repaired,
      );

      // 保留 completed 断点：刚写完就断线续跑时可去重，不必再烧 AI
      const completed = buildActive("completed", {
        draftText: clipActiveWriteDraft(repaired.draft),
        draftChars: repaired.draft.length,
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
          draft: repaired.draft,
          charCount: repaired.draft.length,
          newReferences: result.references,
          pipelineMode: result.pipelineMode,
          verification: result.verification,
          issueCount: result.issueCount,
          citationWarnings: result.citationWarnings,
          persisted: persisted ?? null,
          qaReport,
          sectionSpec: boundSpec,
          specSource,
          writingPatches: repaired.patches,
          writingRefined: repaired.refined || undefined,
          blocked: blocked || undefined,
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

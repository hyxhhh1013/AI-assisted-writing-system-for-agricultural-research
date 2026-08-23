import {
  buildAgentPlotRefineHref,
  encodeFigureSpecParam,
} from "@/contracts/figure";
import type { ProjectChartAsset } from "@/contracts/figure";
import type { MechanismLayout } from "@/contracts/mechanism-spec";
import {
  insertOrReplaceAgentSectionImage,
  listAgentCharts,
  persistAgentChart,
  removeAgentChart,
} from "@/lib/agent/chart-persist";
import {
  getMechanismTemplate,
  listMechanismTemplateIds,
  resolveReplaceForAntiStack,
} from "@/lib/agent/figure-loop";
import { runMechanismGeneration } from "@/lib/agent/mechanism-runner";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  buildAlternateLayoutSpec,
  buildFlowDiagramConfig,
  buildForkFlow,
  buildMechanismPanelConfig,
  compileMechanismSpec,
  defaultStepsForPanelTitle,
  mechanismSpecToRenderConfig,
  pathwayTokensFromTitle,
} from "@/lib/mechanism-spec-compiler";
import { refineMechanismSpec } from "@/lib/mechanism-spec-run";

export {
  buildFlowDiagramConfig,
  buildForkFlow,
  buildMechanismPanelConfig,
  defaultStepsForPanelTitle,
  pathwayTokensFromTitle,
};

/** 多面板单栏输入：每栏必须有中文流程步骤，禁止依赖「Upload figure asset」占位 */
export type MechanismPanelInput = {
  title: string;
  steps?: string[];
  bullets?: string[];
  note?: string;
};

export type MechanismPanelSpec = MechanismPanelInput;

function parseJsonArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parsePanelSpecs(raw: unknown): MechanismPanelInput[] {
  const arr = parseJsonArray(raw);
  if (!arr) return [];
  const out: MechanismPanelInput[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.name ?? "").trim();
    if (!title) continue;
    const steps = Array.isArray(o.steps)
      ? o.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : undefined;
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
      : undefined;
    const note = o.note != null ? String(o.note).trim() : undefined;
    out.push({
      title,
      steps: steps && steps.length > 0 ? steps : undefined,
      bullets: bullets && bullets.length > 0 ? bullets : undefined,
      note: note || undefined,
    });
  }
  return out;
}

/**
 * 机理图 / 流程图：能直接出图的（flow / mechanism_panel）当场生成 PNG 并写入项目、
 * 可按 sectionKey 插入章节；mermaid（mechanism）需浏览器渲染，仍返回 /plot 深链。
 * 返回的 href 始终可打开 /plot 用素材细化。
 */
export const draftMechanismFigureTool: ToolDefinition = {
  name: "draft_mechanism_figure",
  description:
    "根据文字描述生成期刊级机理图/流程图并写入项目图表库。"
    + "先编译 MechanismSpec：主张进 caption，温度/催化剂等条件上边，节点只留过程短语。"
    + "kind=flow：传 flowSteps（中文，≥2）或 nodesJson+edgesJson；≥4 步默认分叉汇合。"
    + "kind=mechanism_panel：优先 panelsJson=[{title,steps,bullets?,note?},...]（2～3 栏，每栏中文 steps）；"
    + "禁止依赖 Upload 占位或英文 Pathway 模板。"
    + "未指定 layout 且 ≥4 步时会额外出一套版式候选（chain/fork），只入库推荐稿。"
    + "qaReport.block 不入库、不插章节；按 findings 改 Spec 再出，不要整图重掷。"
    + "改图务必传 replaceImageUrl（旧图 URL）就地替换，勿追加第二张。"
    + "同标题/同章节已有图时，不传 replace 会自动就地替换（防叠图）。"
    + "农科常用模板可传 templateId："
    + listMechanismTemplateIds().join("/")
    + "。"
    + "传 sectionKey 可插入或替换章节图片。"
    + "期刊观感请在 /plot 精修。不使用文生图当主渲染器。",
  safety: "write",
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["mechanism_panel", "flow", "mechanism"],
        description: "mechanism_panel=多栏合成；flow=Graphviz 流程；mechanism=Mermaid 草图",
      },
      title: { type: "string", description: "图标题（中文）" },
      claim: {
        type: "string",
        description: "这张图要辩护的一句话，写入 caption，不要画进节点",
      },
      preset: {
        type: "string",
        enum: ["nature", "agr_journal", "print_bw"],
        description: "刊规配色；默认 nature",
      },
      templateId: {
        type: "string",
        description:
          "可选农科机理模板："
          + listMechanismTemplateIds().join(" | ")
          + "；提供后可省略 panelsJson/flowSteps（仍可用参数覆盖）",
      },
      replaceImageUrl: {
        type: "string",
        description: "改图：旧图 /api/charts/...png；就地替换正文并删除旧资产",
      },
      replaceChartId: {
        type: "string",
        description: "改图：旧图表资产 id（与 replaceImageUrl 二选一）",
      },
      panelTitles: {
        type: "array",
        items: { type: "string" },
        description: "多面板各栏标题（2～3）；若无 panelsJson，将按标题自动生成中文流程（仍推荐传 panelsJson）",
      },
      panelsJson: {
        type: "string",
        description:
          'mechanism_panel 推荐。JSON 数组，如 [{"title":"脱氧路径","steps":["含氧前体","脱水","脱羧","脱氧产物"],"bullets":["酸位主导"]},{"title":"芳构化","steps":["烯烃","环化","芳烃"]}]',
      },
      flowSteps: {
        type: "array",
        items: { type: "string" },
        description: "kind=flow 的中文步骤（2~8）。括号内条件会提升到边上。≥4 步默认分叉；layout=chain 可强制单链",
      },
      layout: {
        type: "string",
        enum: ["chain", "fork"],
        description: "flow 布局：chain 单链；fork 分叉汇合（默认 ≥4 步）。指定后不再出第二套候选",
      },
      nodesJson: {
        type: "string",
        description: 'flow 自定义节点 JSON：[{"id":"1","label":"原料","role":"start_end"},...]',
      },
      edgesJson: {
        type: "string",
        description: 'flow 自定义边 JSON：[{"from":"1","to":"2","label":"500℃"},...]',
      },
      pathwayNotes: {
        type: "string",
        description: "路径/机理要点（仅作一处 callout，勿大段重复堆叠）",
      },
      mermaid: {
        type: "string",
        description: "若 kind=mechanism，可直接给 Mermaid 源码（节点用中文）",
      },
      sectionKey: {
        type: "string",
        description: `可选：论文章节 key（如 results）。提供则插入 Markdown 图片到该章节并关联资产。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      },
      figureBriefConfirmed: {
        type: "string",
        description: "用户已确认 FigureBrief 后可传 true，跳过再次询问",
      },
      skipFigureBrief: {
        type: "string",
        description: "紧急跳过 FigureBrief（默认勿用）",
      },
      persistToProject: {
        type: "string",
        description: "是否写入 Project.charts（默认 true）",
      },
    },
    required: ["kind", "title"],
  },
  execute: async (params, ctx: AgentContext) => {
    if (!ctx.projectId) {
      return { success: false, error: "draft_mechanism_figure 需要关联 projectId" };
    }

    const template = getMechanismTemplate(String(params.templateId ?? ""));
    let kindRaw = String(params.kind || template?.kind || "mechanism_panel");
    if (template && (!params.kind || String(params.kind) === template.kind)) {
      kindRaw = template.kind;
    }
    const kind =
      kindRaw === "flow" || kindRaw === "mechanism" || kindRaw === "mechanism_panel"
        ? kindRaw
        : "mechanism_panel";
    const title =
      String(params.title || template?.title || "机理示意图").trim() || "机理示意图";
    const notes =
      String(params.pathwayNotes || template?.pathwayNotes || "").trim();
    const panelTitles = Array.isArray(params.panelTitles)
      ? params.panelTitles.map((t) => String(t).trim()).filter(Boolean)
      : template?.panels?.map((p) => p.title) ?? [];
    let panelSpecs = parsePanelSpecs(params.panelsJson);
    if (panelSpecs.length < 2 && template?.panels && template.panels.length >= 2) {
      panelSpecs = template.panels.map((p) => ({
        title: p.title,
        steps: p.steps,
        bullets: p.bullets,
      }));
    }

    const persistToProject = parsePersistToProject(params.persistToProject);
    const sectionKeyRaw = params.sectionKey ? String(params.sectionKey).trim() : "";
    const sectionKey =
      sectionKeyRaw && isAgentWritingSectionKey(sectionKeyRaw)
        ? sectionKeyRaw
        : sectionKeyRaw
          ? null
          : undefined;
    if (sectionKeyRaw && sectionKey === null) {
      return {
        success: false,
        error: `无效 sectionKey: ${sectionKeyRaw}。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      };
    }

    const existingCharts = await listAgentCharts(ctx.projectId);
    const anti = resolveReplaceForAntiStack({
      params: {
        ...params,
        title,
        sectionKey: sectionKey ?? sectionKeyRaw,
      },
      charts: existingCharts,
    });
    const replaceImageUrl = String(anti.params.replaceImageUrl ?? "").trim();
    const replaceChartId = String(anti.params.replaceChartId ?? "").trim();
    const autoReplaced = anti.autoReplaced;

    if (kind === "mechanism") {
      const mermaid =
        typeof params.mermaid === "string" && params.mermaid.trim()
          ? params.mermaid.trim()
          : `graph TD
    A[原料输入] --> B{关键步骤}
    B -->|路径1| C[产物A]
    B -->|路径2| D[产物B]
    C --> E[目标导向]
    D --> E`;
      const config = { mermaid, title };
      const figureSpecEnc = encodeFigureSpecParam({ tool: "mechanism", caption: title, config });
      const href = buildAgentPlotRefineHref({
        projectId: ctx.projectId,
        figureId: "mechanism",
        figureSpecEnc,
      });
      return {
        success: true,
        data: { kind, title, config, href, figureSpecEnc, imageUrl: undefined },
        summary: `已草稿 Mermaid 机理图「${title}」。打开 ${href} 渲染并导出；节点请用中文。`,
      };
    }

    const flowStepsRaw = Array.isArray(params.flowSteps)
      ? params.flowSteps.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : [];
    const flowSteps =
      flowStepsRaw.length >= 2
        ? flowStepsRaw
        : (template?.flowSteps ?? []).slice(0, 8);
    const layoutRaw = String(params.layout || "").toLowerCase();
    const layout: MechanismLayout | undefined =
      layoutRaw === "chain" || layoutRaw === "fork" ? layoutRaw : undefined;
    const claim = String(params.claim ?? "").trim();
    const preset = String(params.preset ?? "").trim();

    const compiled = compileMechanismSpec({
      kind,
      title,
      claim: claim || undefined,
      notes,
      preset: preset || undefined,
      layout,
      flowSteps,
      nodesJson: params.nodesJson,
      edgesJson: params.edgesJson,
      panelTitles,
      panels: panelSpecs.length >= 2 ? panelSpecs : undefined,
    });
    const refined = refineMechanismSpec(compiled.spec);
    const spec = refined.spec;
    const qaReport = refined.qaReport;
    const blocked = qaReport.verdict === "block";
    const figureId = spec.kind;
    const config = mechanismSpecToRenderConfig(spec);
    const figureSpecEnc = encodeFigureSpecParam({ tool: figureId, caption: spec.caption, config });

    if (blocked) {
      return {
        success: true,
        data: {
          kind: spec.kind,
          title: spec.caption,
          blocked: true,
          mechanismSpec: spec,
          qaReport,
          specPatches: refined.patches,
          figureSpecEnc,
          next: {
            hint: "按 qaReport.findings 改节点/边/steps 后重出，不要整图重掷",
          },
        },
        summary:
          `机理图「${spec.caption}」质量未过线（${qaReport.findings
            .filter((f) => f.action === "block")
            .map((f) => f.code)
            .join("、") || "block"}），未入库也未插入章节。按 findings 改 Spec 再出。`,
      };
    }

    try {
      const generated = await runMechanismGeneration(spec.kind, config);

      let alternate:
        | {
            layout: MechanismLayout;
            imageUrl: string;
            svgUrl?: string;
            pdfUrl?: string;
          }
        | undefined;
      const altSpec = buildAlternateLayoutSpec(spec);
      if (altSpec) {
        try {
          const alt = await runMechanismGeneration(
            altSpec.kind,
            mechanismSpecToRenderConfig(altSpec),
          );
          alternate = {
            layout: altSpec.layout,
            imageUrl: alt.imageUrl,
            svgUrl: alt.svgUrl,
            pdfUrl: alt.pdfUrl,
          };
        } catch {
          /* 候选失败不影响主稿 */
        }
      }

      let insertMode: "replaced" | "appended" | undefined;
      let retiredId: string | undefined;
      if (sectionKey) {
        const ins = await insertOrReplaceAgentSectionImage(
          ctx.userId,
          ctx.projectId,
          {
            sectionKey,
            caption: spec.caption,
            imageUrl: generated.imageUrl,
            replaceImageUrl: replaceImageUrl || undefined,
            replaceChartId: replaceChartId || undefined,
          },
        );
        insertMode = ins.mode;
        retiredId = ins.retiredId;
      } else if (replaceImageUrl || replaceChartId) {
        try {
          const r = await removeAgentChart(ctx.userId, ctx.projectId, {
            chartId: replaceChartId || undefined,
            imageUrl: replaceImageUrl || undefined,
            stripFromBody: true,
          });
          retiredId = r.deleted.id;
        } catch {
          /* 旧资产不存在则忽略 */
        }
      }

      let persisted: ProjectChartAsset | null = null;
      if (persistToProject) {
        persisted = await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId,
          caption: spec.caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: sectionKey ?? undefined,
          figureSpecEnc,
        });
      }

      const href = buildAgentPlotRefineHref({
        projectId: ctx.projectId,
        figureId,
        figureSpecEnc,
        chartAssetId: persisted?.id,
        imageUrl: generated.imageUrl,
      });

      const bits = [
        `已生成${spec.kind === "flow" ? "流程图" : "多面板机理图"}「${spec.caption}」`,
        `版式 ${spec.layout}`,
      ];
      if (refined.patches.length) {
        bits.push(`已自动修补 ${refined.patches.length} 项`);
      }
      if (alternate) {
        bits.push(
          `另有 ${alternate.layout} 版式候选（${alternate.imageUrl}），说一声可带 layout=${alternate.layout} 就地替换`,
        );
      }
      if (persisted) bits.push("已登记到项目图表库");
      if (insertMode === "replaced" || autoReplaced) {
        bits.push(`已就地替换旧图（防叠图${autoReplaced ? "·自动" : ""}）`);
      } else if (insertMode === "appended") {
        bits.push(`已插入章节 ${sectionKey}`);
      }
      if (retiredId) bits.push("已删除旧图表资产");
      if (template) bits.push(`模板 ${String(params.templateId)}`);
      bits.push(
        "系统将自动 read_figure(qa) 扫残余观感；期刊精修请打开 href。"
        + `若改图请带 replaceImageUrl="${generated.imageUrl}"`,
      );

      return {
        success: true,
        data: {
          kind: spec.kind,
          title: spec.caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          persisted,
          insertedSection: sectionKey,
          insertMode,
          retiredId,
          href,
          figureSpecEnc,
          mechanismSpec: spec,
          qaReport,
          specPatches: refined.patches,
          layout: spec.layout,
          candidates: alternate
            ? [
                { layout: spec.layout, imageUrl: generated.imageUrl, recommended: true },
                { layout: alternate.layout, imageUrl: alternate.imageUrl, recommended: false },
              ]
            : undefined,
          next: {
            tool: "read_figure",
            params: { imageUrl: generated.imageUrl, mode: "qa" },
          },
        },
        summary: bits.join("；"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackHref = buildAgentPlotRefineHref({
        projectId: ctx.projectId,
        figureId,
        figureSpecEnc,
      });
      return {
        success: false,
        error: message,
        data: { href: fallbackHref, figureSpecEnc, mechanismSpec: spec, qaReport },
        summary: `出图失败，已改为返回绘图页链接：${fallbackHref}`,
      };
    }
  },
};

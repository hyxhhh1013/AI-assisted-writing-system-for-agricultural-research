import {
  buildAgentPlotRefineHref,
  encodeFigureSpecParam,
} from "@/contracts/figure";
import type { ProjectChartAsset } from "@/contracts/figure";
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

/** 多面板单栏输入：每栏必须有中文流程步骤，禁止依赖「Upload figure asset」占位 */
export type MechanismPanelSpec = {
  title: string;
  /** 该栏流程节点（≥2）；优先使用 */
  steps?: string[];
  /** 可选短要点（≤3 行），渲染为 text，勿与标题重复 */
  bullets?: string[];
  /** 该栏 callout（仅一处；勿与整图 footnote 重复） */
  note?: string;
};

type FlowNode = { id: string; label: string; role: "start_end" | "process" | "decision" };
type FlowEdge = { from: string; to: string; label?: string };

/** 从栏标题拆出路径词（「脱氧路径：脱水/脱羧/脱羰」→ ["脱水","脱羧","脱羰"]） */
export function pathwayTokensFromTitle(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];
  const afterColon = raw.split(/[:：]/).slice(1).join("：").trim();
  const source = afterColon || raw;
  const parts = source
    .split(/[\/、·,，|]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 24);
  return parts.slice(0, 4);
}

/** 无 steps 时用标题生成可读中文链，避免英文 Pathway/Product 模板 */
export function defaultStepsForPanelTitle(title: string): string[] {
  const tokens = pathwayTokensFromTitle(title);
  const head = title.split(/[:：]/)[0]?.trim() || title.trim() || "过程";
  if (tokens.length >= 2) {
    return ["含氧前体", ...tokens, "目标产物"].slice(0, 6);
  }
  if (tokens.length === 1) {
    return ["反应物", tokens[0]!, "产物"];
  }
  return [`输入·${head}`, head, `输出·${head}`];
}

function buildChainNodes(steps: string[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = steps.map((label, i) => ({
    id: String(i + 1),
    label,
    role: i === 0 || i === steps.length - 1 ? "start_end" : "process",
  }));
  const edges: FlowEdge[] = steps.slice(1).map((_, i) => ({
    from: String(i + 1),
    to: String(i + 2),
  }));
  return { nodes, edges };
}

/**
 * ≥4 步时默认分叉汇合（概念框架更像机理，而非单列清单）：
 * start → hub → 并行中段 → end
 */
export function buildForkFlow(steps: string[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (steps.length < 4) return buildChainNodes(steps);
  const start = steps[0]!;
  const hub = steps[1]!;
  const end = steps[steps.length - 1]!;
  const mids = steps.slice(2, -1);
  const nodes: FlowNode[] = [
    { id: "1", label: start, role: "start_end" },
    { id: "2", label: hub, role: "process" },
    ...mids.map((label, i) => ({
      id: String(i + 3),
      label,
      role: "process" as const,
    })),
    { id: String(mids.length + 3), label: end, role: "start_end" },
  ];
  const endId = String(mids.length + 3);
  const edges: FlowEdge[] = [{ from: "1", to: "2" }];
  for (let i = 0; i < mids.length; i++) {
    const midId = String(i + 3);
    edges.push({ from: "2", to: midId });
    edges.push({ from: midId, to: endId });
  }
  return { nodes, edges };
}

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

function parseFlowNodes(raw: unknown): FlowNode[] | null {
  const arr = parseJsonArray(raw);
  if (!arr || arr.length < 2) return null;
  const nodes: FlowNode[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const label = String(o.label ?? o.text ?? "").trim();
    if (!label) return null;
    const roleRaw = String(o.role ?? "").toLowerCase();
    const role: FlowNode["role"] =
      roleRaw === "start_end" || roleRaw === "decision" || roleRaw === "process"
        ? roleRaw
        : i === 0 || i === arr.length - 1
          ? "start_end"
          : "process";
    nodes.push({
      id: String(o.id ?? i + 1),
      label,
      role,
    });
  }
  return nodes;
}

function parseFlowEdges(raw: unknown, nodeIds: Set<string>): FlowEdge[] | null {
  const arr = parseJsonArray(raw);
  if (!arr || arr.length === 0) return null;
  const edges: FlowEdge[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const from = String(o.from ?? o.source ?? "").trim();
    const to = String(o.to ?? o.target ?? "").trim();
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const label = o.label != null ? String(o.label).trim() : "";
    edges.push(label ? { from, to, label } : { from, to });
  }
  return edges.length > 0 ? edges : null;
}

/** 流程图 config（Graphviz 风格，flow_diagram_v2.py 消费） */
export function buildFlowDiagramConfig(input: {
  title: string;
  notes: string;
  flowSteps?: string[];
  /** chain=单链；fork=分叉汇合（≥4 步默认）；custom=用 nodes/edges */
  layout?: "chain" | "fork" | "custom";
  nodesJson?: unknown;
  edgesJson?: unknown;
}): Record<string, unknown> {
  const customNodes = parseFlowNodes(input.nodesJson);
  if (customNodes) {
    const ids = new Set(customNodes.map((n) => n.id));
    const customEdges =
      parseFlowEdges(input.edgesJson, ids)
      ?? customNodes.slice(1).map((_, i) => ({
        from: customNodes[i]!.id,
        to: customNodes[i + 1]!.id,
      }));
    return {
      title: input.title,
      preset: "nature",
      direction: "vertical",
      look: "journal",
      nodes: customNodes,
      edges: customEdges,
    };
  }

  const steps = (input.flowSteps ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 8);

  if (steps.length >= 2) {
    const layout =
      input.layout === "chain" || input.layout === "fork"
        ? input.layout
        : steps.length >= 4
          ? "fork"
          : "chain";
    const { nodes, edges } =
      layout === "fork" ? buildForkFlow(steps) : buildChainNodes(steps);
    return {
      title: input.title,
      preset: "nature",
      direction: "vertical",
      look: "journal",
      nodes,
      edges,
    };
  }

  // 未提供步骤：用标题生成中文链（禁止英文 Feedstock 模板）
  const fallback = defaultStepsForPanelTitle(input.title || "转化过程");
  const { nodes, edges } = buildChainNodes(fallback);
  if (input.notes) {
    edges[0] = { ...edges[0]!, label: input.notes.slice(0, 24) };
  }
  return {
    title: input.title,
    preset: "nature",
    direction: "vertical",
    look: "journal",
    nodes,
    edges,
  };
}

function parsePanelSpecs(raw: unknown): MechanismPanelSpec[] {
  const arr = parseJsonArray(raw);
  if (!arr) return [];
  const out: MechanismPanelSpec[] = [];
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

/** 多面板机理图：每栏 flow_subgraph（中文步骤），不再塞无素材 image 占位 */
export function buildMechanismPanelConfig(input: {
  title: string;
  panelTitles: string[];
  notes: string;
  panels?: MechanismPanelSpec[];
}): Record<string, unknown> {
  let panelsIn = (input.panels ?? []).slice(0, 3);
  if (panelsIn.length < 2) {
    const titles =
      input.panelTitles.length >= 2
        ? input.panelTitles.slice(0, 3)
        : ["组成与结构", "活性位与路径", "产物导向"];
    while (titles.length < 2) titles.push(`路径 ${titles.length + 1}`);
    panelsIn = titles.map((title) => ({ title }));
  }

  const ids = ["a", "b", "c"].slice(0, panelsIn.length);
  const globalNote = input.notes.trim();
  let noteUsed = false;

  const panels = ids.map((id, i) => {
    const spec = panelsIn[i]!;
    const steps =
      spec.steps && spec.steps.length >= 2
        ? spec.steps.slice(0, 8)
        : defaultStepsForPanelTitle(spec.title);
    const { nodes, edges } =
      steps.length >= 4 ? buildForkFlow(steps) : buildChainNodes(steps);

    const blocks: Array<Record<string, unknown>> = [];
    if (spec.bullets?.length) {
      blocks.push({
        type: "text",
        content: spec.bullets.join("；"),
      });
    }
    blocks.push({
      type: "flow_subgraph",
      direction: "vertical",
      nodes,
      edges,
    });

    const panelNote = spec.note?.trim();
    if (panelNote) {
      blocks.push({ type: "callout", content: panelNote });
      noteUsed = true;
    } else if (globalNote && i === panelsIn.length - 1 && !noteUsed) {
      // 整图 notes 只落在最后一栏 callout 一次，避免与 footnote 重复
      blocks.push({ type: "callout", content: globalNote });
      noteUsed = true;
    }

    return {
      id,
      title: spec.title,
      blocks,
    };
  });

  return { title: input.title, preset: "nature", panels };
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
    + "kind=flow：传 flowSteps（中文，≥2）或 nodesJson+edgesJson；≥4 步默认分叉汇合。"
    + "kind=mechanism_panel：优先 panelsJson=[{title,steps,bullets?,note?},...]（2～3 栏，每栏中文 steps）；"
    + "禁止依赖 Upload 占位或英文 Pathway 模板。"
    + "生成后务必 read_figure(imageUrl=…, mode=qa) 回看；若有占位/英文模板/空栏，用更具体 steps 重生成。"
    + "改图务必传 replaceImageUrl（旧图 URL）就地替换，勿追加第二张。"
    + "同标题/同章节已有图时，不传 replace 会自动就地替换（防叠图）。"
    + "农科常用模板可传 templateId："
    + listMechanismTemplateIds().join("/")
    + "。"
    + "传 sectionKey 可插入或替换章节图片。"
    + "出图后系统会自动 read_figure(qa)；期刊观感请在 /plot 精修。",
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
        description: "kind=flow 的中文步骤（2~8）。≥4 步默认分叉汇合；layout=chain 可强制单链",
      },
      layout: {
        type: "string",
        enum: ["chain", "fork"],
        description: "flow 布局：chain 单链；fork 分叉汇合（默认 ≥4 步）",
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

    // 模板：提升农科机理草稿下限；参数可覆盖
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

    // P0 防叠图：同标题/同章节已有图且未传 replace → 自动填 replaceImageUrl
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

    // ── Mermaid 草图：需浏览器渲染，返回 /plot 深链 ──
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

    // ── flow / mechanism_panel：直接出图 ──
    const flowStepsRaw = Array.isArray(params.flowSteps)
      ? params.flowSteps.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : [];
    const flowSteps =
      flowStepsRaw.length >= 2
        ? flowStepsRaw
        : (template?.flowSteps ?? []).slice(0, 8);
    const layoutRaw = String(params.layout || "").toLowerCase();
    const layout =
      layoutRaw === "chain" || layoutRaw === "fork" ? layoutRaw : undefined;

    let config: Record<string, unknown>;
    let figureId: "flow" | "mechanism_panel";
    if (kind === "flow") {
      config = buildFlowDiagramConfig({
        title,
        notes,
        flowSteps,
        layout,
        nodesJson: params.nodesJson,
        edgesJson: params.edgesJson,
      });
      figureId = "flow";
    } else {
      config = buildMechanismPanelConfig({
        title,
        panelTitles,
        notes,
        panels: panelSpecs.length >= 2 ? panelSpecs : undefined,
      });
      figureId = "mechanism_panel";
    }

    const figureSpecEnc = encodeFigureSpecParam({ tool: figureId, caption: title, config });

    try {
      const generated = await runMechanismGeneration(kind, config);

      let insertMode: "replaced" | "appended" | undefined;
      let retiredId: string | undefined;
      if (sectionKey) {
        const ins = await insertOrReplaceAgentSectionImage(
          ctx.userId,
          ctx.projectId,
          {
            sectionKey,
            caption: title,
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
          caption: title,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: sectionKey ?? undefined,
          figureSpecEnc,
        });
      }

      // 优先 chartAssetId，避免长 figureSpec 塞 URL 被截断后无法回放
      const href = buildAgentPlotRefineHref({
        projectId: ctx.projectId,
        figureId,
        figureSpecEnc,
        chartAssetId: persisted?.id,
        imageUrl: generated.imageUrl,
      });

      const bits = [
        `已生成${kind === "flow" ? "流程图" : "多面板机理图"}「${title}」`,
      ];
      if (persisted) bits.push("已登记到项目图表库");
      if (insertMode === "replaced" || autoReplaced) {
        bits.push(`已就地替换旧图（防叠图${autoReplaced ? "·自动" : ""}）`);
      } else if (insertMode === "appended") {
        bits.push(`已插入章节 ${sectionKey}`);
      }
      if (retiredId) bits.push("已删除旧图表资产");
      if (template) bits.push(`模板 ${String(params.templateId)}`);
      bits.push(
        "系统将自动 read_figure(qa)；期刊观感请打开 href 在绘图页精修。"
        + `若改图请带 replaceImageUrl="${generated.imageUrl}"`,
      );

      return {
        success: true,
        data: {
          kind,
          title,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          persisted,
          insertedSection: sectionKey,
          insertMode,
          retiredId,
          href,
          figureSpecEnc,
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
        data: { href: fallbackHref, figureSpecEnc },
        summary: `出图失败，已改为返回绘图页链接：${fallbackHref}`,
      };
    }
  },
};

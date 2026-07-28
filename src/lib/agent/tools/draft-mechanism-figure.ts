import { encodeFigureSpecParam } from "@/contracts/figure";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 根据用户描述草稿期刊机理图结构（多面板 / 流程 / Mermaid），
 * 返回可打开 /plot 的 figureSpec，不代替 3D 素材绘制。
 */
export const draftMechanismFigureTool: ToolDefinition = {
  name: "draft_mechanism_figure",
  description:
    "根据文字描述草稿期刊级机理图/流程图结构（多面板 a/b/c、流程节点或 Mermaid）。返回 plot 深链与 JSON，供用户在 /plot 上传素材后出图。不生成写实 3D。",
  safety: "read",
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["mechanism_panel", "flow", "mechanism"],
        description: "mechanism_panel=多栏合成；flow=Graphviz 流程；mechanism=Mermaid 草图",
      },
      title: { type: "string", description: "图标题" },
      panelTitles: {
        type: "array",
        items: { type: "string" },
        description: "多面板时各栏标题（2～3 个）",
      },
      pathwayNotes: {
        type: "string",
        description: "路径/机理要点（用于脚注与 callout）",
      },
      mermaid: {
        type: "string",
        description: "若 kind=mechanism，可直接给 Mermaid 源码",
      },
    },
    required: ["kind", "title"],
  },
  execute: async (params, ctx: AgentContext) => {
    const kindRaw = String(params.kind || "mechanism_panel");
    const kind =
      kindRaw === "flow" || kindRaw === "mechanism" || kindRaw === "mechanism_panel"
        ? kindRaw
        : "mechanism_panel";
    const title = String(params.title || "Mechanism figure").trim() || "Mechanism figure";
    const notes = String(params.pathwayNotes || "").trim();
    const panelTitles = Array.isArray(params.panelTitles)
      ? params.panelTitles.map((t) => String(t).trim()).filter(Boolean)
      : [];

    if (kind === "mechanism") {
      const mermaid =
        typeof params.mermaid === "string" && params.mermaid.trim()
          ? params.mermaid.trim()
          : `graph TD
    A[Input] --> B{Key step}
    B -->|path 1| C[Product A]
    B -->|path 2| D[Product B]
    C --> E[Outcome]
    D --> E`;
      const config = { mermaid, title };
      const figureSpecEnc = encodeFigureSpecParam({
        tool: "mechanism",
        caption: title,
        config,
      });
      const href = ctx.projectId
        ? `/plot?id=${encodeURIComponent(ctx.projectId)}&figure=mechanism&figureSpec=${figureSpecEnc}`
        : `/plot?figure=mechanism&figureSpec=${figureSpecEnc}`;
      return {
        success: true,
        data: { kind, title, config, href, figureSpecEnc },
        summary: `已草稿 Mermaid 机理图「${title}」。打开 ${href} 预览并导出。`,
      };
    }

    if (kind === "flow") {
      const config = {
        title,
        preset: "nature",
        direction: "vertical",
        nodes: [
          { id: "1", label: "Feedstock", role: "start_end" },
          { id: "2", label: "Conversion", role: "process" },
          { id: "3", label: "Separation", role: "decision" },
          { id: "4", label: "Product A", role: "start_end" },
          { id: "5", label: "Product B", role: "start_end" },
        ],
        edges: [
          { from: "1", to: "2", label: notes ? "see notes" : "T, P" },
          { from: "2", to: "3" },
          { from: "3", to: "4", label: "path A" },
          { from: "3", to: "5", label: "path B" },
        ],
      };
      const figureSpecEnc = encodeFigureSpecParam({
        tool: "flow",
        caption: title,
        config,
      });
      const href = ctx.projectId
        ? `/plot?id=${encodeURIComponent(ctx.projectId)}&figure=flow&figureSpec=${figureSpecEnc}`
        : `/plot?figure=flow&figureSpec=${figureSpecEnc}`;
      return {
        success: true,
        data: { kind, title, config, notes, href, figureSpecEnc },
        summary: `已草稿期刊流程图「${title}」。打开 ${href} 用 Graphviz 出 PNG/SVG/PDF。`,
      };
    }

    const titles =
      panelTitles.length >= 2
        ? panelTitles.slice(0, 3)
        : ["Composition", "Design space", "Target pathways"];
    while (titles.length < 2) titles.push(`Panel ${titles.length + 1}`);
    const ids = ["a", "b", "c"].slice(0, titles.length);
    const panels = ids.map((id, i) => ({
      id,
      title: titles[i],
      footnote: i === titles.length - 1 ? notes || undefined : undefined,
      blocks: [
        {
          type: "text" as const,
          content: `Panel (${id}): ${titles[i]}`,
        },
        ...(i === 0 || i === 1
          ? [
              {
                type: "image" as const,
                assetKey: `panel_${id}_img`,
                caption: "Upload 3D / photo asset in /plot",
              },
            ]
          : [
              {
                type: "flow_subgraph" as const,
                direction: "vertical" as const,
                nodes: [
                  { id: "1", label: "M/support-A", role: "start_end" },
                  { id: "2", label: "M/support-B", role: "start_end" },
                  { id: "3", label: "Pathway 1", role: "process", color: "#8BCF8B" },
                  { id: "4", label: "Pathway 2", role: "process", color: "#42949E" },
                  { id: "5", label: "Product 1", role: "start_end" },
                  { id: "6", label: "Product 2", role: "start_end" },
                ],
                edges: [
                  { from: "1", to: "3" },
                  { from: "2", to: "4" },
                  { from: "3", to: "5" },
                  { from: "4", to: "6" },
                ],
              },
              ...(notes
                ? [{ type: "callout" as const, content: notes }]
                : []),
            ]),
      ],
    }));

    const config = { title, preset: "nature", panels };
    const figureSpecEnc = encodeFigureSpecParam({
      tool: "mechanism_panel",
      caption: title,
      config,
    });
    const href = ctx.projectId
      ? `/plot?id=${encodeURIComponent(ctx.projectId)}&figure=mechanism_panel&figureSpec=${figureSpecEnc}`
      : `/plot?figure=mechanism_panel&figureSpec=${figureSpecEnc}`;

    return {
      success: true,
      data: {
        kind,
        title,
        config,
        href,
        figureSpecEnc,
        hint: "在 /plot 多面板工具中上传各栏素材图后点击合成；3D 写实渲染需外部准备。",
      },
      summary: `已草稿多面板机理图「${title}」（${ids.join("/")}）。打开 ${href}，上传素材后合成出刊图。`,
    };
  },
};

import { encodeFigureSpecParam } from "@/contracts/figure";
import type { ProjectChartAsset } from "@/contracts/figure";
import { persistAgentChart } from "@/lib/agent/chart-persist";
import { runMechanismGeneration } from "@/lib/agent/mechanism-runner";
import { appendAgentSectionMarkdown } from "@/lib/agent/project-persist";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/** 流程图 config（Graphviz 风格，flow_diagram_v2.py 消费） */
export function buildFlowDiagramConfig(input: {
  title: string;
  notes: string;
}): Record<string, unknown> {
  return {
    title: input.title,
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
      { from: "1", to: "2", label: input.notes ? "see notes" : "T, P" },
      { from: "2", to: "3" },
      { from: "3", to: "4", label: "path A" },
      { from: "3", to: "5", label: "path B" },
    ],
  };
}

/** 多面板机理图 config（mechanism_panel.py 消费）；无素材的 image 块渲染占位框 */
export function buildMechanismPanelConfig(input: {
  title: string;
  panelTitles: string[];
  notes: string;
}): Record<string, unknown> {
  const titles =
    input.panelTitles.length >= 2
      ? input.panelTitles.slice(0, 3)
      : ["Composition", "Design space", "Target pathways"];
  while (titles.length < 2) titles.push(`Panel ${titles.length + 1}`);
  const ids = ["a", "b", "c"].slice(0, titles.length);
  const panels = ids.map((id, i) => ({
    id,
    title: titles[i],
    footnote: i === titles.length - 1 ? input.notes || undefined : undefined,
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
            ...(input.notes ? [{ type: "callout" as const, content: input.notes }] : []),
          ]),
    ],
  }));

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
    "根据文字描述生成期刊级机理图/流程图并写入项目图表库。kind=flow 用 Graphviz 流程；"
    + "kind=mechanism_panel 用多面板合成（含占位框，可在 /plot 上传素材细化）；kind=mechanism 用 Mermaid 草图（返回绘图页链接）。"
    + "传 sectionKey（如 results）可把图插入章节正文。已生成即返回 imageUrl。",
  safety: "write",
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
      sectionKey: {
        type: "string",
        description: `可选：论文章节 key（如 results）。提供则插入 Markdown 图片到该章节并关联资产。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
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

    // ── Mermaid 草图：需浏览器渲染，返回 /plot 深链 ──
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
      const figureSpecEnc = encodeFigureSpecParam({ tool: "mechanism", caption: title, config });
      const href = `/plot?id=${encodeURIComponent(ctx.projectId)}&figure=mechanism&figureSpec=${figureSpecEnc}`;
      return {
        success: true,
        data: { kind, title, config, href, figureSpecEnc, imageUrl: undefined },
        summary: `已草稿 Mermaid 机理图「${title}」。打开 ${href} 渲染并导出。`,
      };
    }

    // ── flow / mechanism_panel：直接出图 ──
    let config: Record<string, unknown>;
    let figureId: "flow" | "mechanism_panel";
    if (kind === "flow") {
      config = buildFlowDiagramConfig({ title, notes });
      figureId = "flow";
    } else {
      config = buildMechanismPanelConfig({ title, panelTitles, notes });
      figureId = "mechanism_panel";
    }

    const figureSpecEnc = encodeFigureSpecParam({ tool: figureId, caption: title, config });
    const href = `/plot?id=${encodeURIComponent(ctx.projectId)}&figure=${figureId}&figureSpec=${figureSpecEnc}`;

    try {
      const generated = await runMechanismGeneration(kind, config);

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

      let insertedSection: string | undefined;
      if (sectionKey) {
        await appendAgentSectionMarkdown(
          ctx.userId,
          ctx.projectId,
          sectionKey,
          `\n\n![${title}](${generated.imageUrl})\n\n`,
        );
        insertedSection = sectionKey;
      }

      const bits = [
        `已生成${kind === "flow" ? "流程图" : "多面板机理图"}「${title}」`,
      ];
      if (persisted) bits.push("已登记到项目图表库");
      if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);
      bits.push("可打开绘图页细化");

      return {
        success: true,
        data: {
          kind,
          title,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          persisted,
          insertedSection,
          href,
          figureSpecEnc,
        },
        summary: bits.join("；"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        data: { href, figureSpecEnc },
        summary: `出图失败，已改为返回绘图页链接：${href}`,
      };
    }
  },
};

/**
 * MechanismSpec 热路径：编译后最多 2 次确定性补丁。
 * Agent 出图与 /plot API 共用，避免两套修补。
 */
import { buildMechanismQaReport, type MechanismQaReport } from "@/contracts/mechanism-qa";
import type { MechanismSpecV1 } from "@/contracts/mechanism-spec";
import { parseMechanismSpec } from "@/contracts/mechanism-spec";
import {
  compileMechanismSpec,
  inspectMechanismSpec,
} from "@/lib/mechanism-spec-compiler";
import {
  applyMechanismSpecPatches,
  type MechanismSpecPatch,
} from "@/lib/mechanism-spec-patches";

const MAX_PATCH_ROUNDS = 2;

export interface RefineMechanismResult {
  spec: MechanismSpecV1;
  qaReport: MechanismQaReport;
  patches: MechanismSpecPatch[];
}

export function refineMechanismSpec(spec: MechanismSpecV1): RefineMechanismResult {
  let current = spec;
  const allPatches: MechanismSpecPatch[] = [];
  let findings = inspectMechanismSpec(current);
  for (let i = 0; i < MAX_PATCH_ROUNDS; i++) {
    const applied = applyMechanismSpecPatches(current, findings);
    if (applied.patches.length === 0) break;
    allPatches.push(...applied.patches);
    current = applied.spec;
    findings = inspectMechanismSpec(current);
  }
  return {
    spec: current,
    qaReport: buildMechanismQaReport(findings),
    patches: allPatches,
  };
}

export interface PlotFlowNode {
  id: string;
  label: string;
  role?: string;
  shape?: string;
  color?: string;
}

export interface PlotFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface RefinePlotFlowResult extends RefineMechanismResult {
  nodes: PlotFlowNode[];
  edges: PlotFlowEdge[];
}

/** /plot 流程图：保留用户拓扑，只把括号条件上边、改英文占位。 */
export function refinePlotFlow(input: {
  title?: string;
  preset?: string;
  nodes: PlotFlowNode[];
  edges: PlotFlowEdge[];
}): RefinePlotFlowResult | null {
  const nodes = input.nodes.filter((n) => n.label.trim());
  if (nodes.length < 2) return null;
  const compiled = compileMechanismSpec({
    kind: "flow",
    title: (input.title ?? "").trim() || "流程图",
    preset: input.preset,
    nodesJson: nodes,
    edgesJson: input.edges,
  });
  const refined = refineMechanismSpec(compiled.spec);
  const graph = refined.spec.graph;
  if (!graph) return { ...refined, nodes, edges: input.edges };
  const extras = new Map(nodes.map((n) => [n.id, n]));
  return {
    ...refined,
    nodes: graph.nodes.map((n) => {
      const old = extras.get(n.id);
      return {
        id: n.id,
        label: n.label,
        role: n.role,
        shape: old?.shape,
        color: old?.color,
      };
    }),
    edges: graph.edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface RefinePlotPanelResult {
  config: Record<string, unknown>;
  qaReport: MechanismQaReport;
  spec: MechanismSpecV1 | null;
  patches: MechanismSpecPatch[];
}

/** /plot 多面板：只修补各栏 flow_subgraph，不改版式、不丢 image/callout。 */
export function refinePlotPanelConfig(config: Record<string, unknown>): RefinePlotPanelResult {
  const next = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  const title = String(next.title ?? "机理示意图").trim() || "机理示意图";
  const preset = String(next.preset ?? "nature");
  const panels = Array.isArray(next.panels) ? next.panels : [];
  const allPatches: MechanismSpecPatch[] = [];
  const findingsAcc: ReturnType<typeof inspectMechanismSpec> = [];

  for (const panel of panels) {
    if (!isRecord(panel) || !Array.isArray(panel.blocks)) continue;
    const panelTitle = String(panel.title ?? title);
    for (const block of panel.blocks) {
      if (!isRecord(block) || block.type !== "flow_subgraph") continue;
      const nodes = Array.isArray(block.nodes) ? (block.nodes as PlotFlowNode[]) : [];
      const edges = Array.isArray(block.edges) ? (block.edges as PlotFlowEdge[]) : [];
      const refined = refinePlotFlow({ title: panelTitle, preset, nodes, edges });
      if (!refined) continue;
      allPatches.push(...refined.patches);
      findingsAcc.push(...refined.qaReport.findings);
      block.nodes = refined.nodes;
      block.edges = refined.edges;
    }
  }

  const lifted = parseMechanismSpec({
    version: 1,
    kind: "mechanism_panel",
    caption: title,
    claim: title,
    journal: { preset },
    layout: "chain",
    layoutLocked: true,
    panels: panels.flatMap((panel, i) => {
      if (!isRecord(panel) || !Array.isArray(panel.blocks)) return [];
      const flow = panel.blocks.find((b) => isRecord(b) && b.type === "flow_subgraph");
      if (!isRecord(flow)) return [];
      return [{
        id: (["a", "b", "c"] as const)[i] ?? "a",
        title: String(panel.title ?? `栏 ${i + 1}`),
        graph: { nodes: flow.nodes, edges: flow.edges },
        note: typeof panel.footnote === "string" ? panel.footnote : undefined,
      }];
    }),
    source: { customGraph: true },
  });

  const specFindings = lifted ? inspectMechanismSpec(lifted) : findingsAcc;
  return {
    config: next,
    spec: lifted,
    qaReport: buildMechanismQaReport(specFindings.length ? specFindings : findingsAcc),
    patches: allPatches,
  };
}

/**
 * MechanismSpec V1 — 机理 / 流程图中间表示（FIG-MECH-QA）。
 * Agent 提交语义意图；编译成节点/边后再交给 Graphviz / mechanism_panel。
 * 主张进 caption，条件上边，不把 claim 画进节点。
 */

export const MECHANISM_SPEC_VERSION = 1 as const;

export type MechanismRenderKind = "flow" | "mechanism_panel";

export type MechanismNodeRole = "start_end" | "process" | "decision";

export type MechanismLayout = "chain" | "fork";

export type MechanismPreset = "nature" | "agr_journal" | "print_bw";

export interface MechanismNode {
  id: string;
  label: string;
  role: MechanismNodeRole;
}

export interface MechanismEdge {
  from: string;
  to: string;
  /** 边上携带的条件（温度、催化剂、试剂）。空=未声明 */
  label?: string;
}

export interface MechanismGraph {
  nodes: MechanismNode[];
  edges: MechanismEdge[];
}

export interface MechanismPanelV1 {
  id: "a" | "b" | "c";
  title: string;
  graph: MechanismGraph;
  bullets?: string[];
  note?: string;
}

export interface MechanismPanelSource {
  title: string;
  steps: string[];
  bullets?: string[];
  note?: string;
}

export interface MechanismSpecSource {
  flowSteps?: string[];
  panels?: MechanismPanelSource[];
  customGraph?: boolean;
}

export interface MechanismSpecV1 {
  version: 1;
  kind: MechanismRenderKind;
  claim: string;
  caption: string;
  journal: { preset: MechanismPreset };
  layout: MechanismLayout;
  layoutLocked: boolean;
  /** 图内允许出现的文字（节点、边、栏题、要点）。claim/caption 不在此列 */
  visibleText: string[];
  graph?: MechanismGraph;
  panels?: MechanismPanelV1[];
  note?: string;
  source: MechanismSpecSource;
}

const PRESETS = new Set<string>(["nature", "agr_journal", "print_bw"]);
const ROLES = new Set<string>(["start_end", "process", "decision"]);
const LAYOUTS = new Set<string>(["chain", "fork"]);
const KINDS = new Set<string>(["flow", "mechanism_panel"]);
const PANEL_IDS = ["a", "b", "c"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMechanismPreset(value: string): value is MechanismPreset {
  return PRESETS.has(value);
}

export function parseMechanismPreset(raw: unknown): MechanismPreset {
  const s = String(raw ?? "").trim();
  return isMechanismPreset(s) ? s : "nature";
}

function parseRole(raw: unknown, index: number, last: number): MechanismNodeRole {
  const s = String(raw ?? "").toLowerCase();
  if (ROLES.has(s)) return s as MechanismNodeRole;
  return index === 0 || index === last ? "start_end" : "process";
}

export function parseMechanismGraph(raw: unknown): MechanismGraph | null {
  if (!isRecord(raw)) return null;
  const nodesRaw = raw.nodes;
  const edgesRaw = raw.edges;
  if (!Array.isArray(nodesRaw) || nodesRaw.length < 2) return null;
  const nodes: MechanismNode[] = [];
  const last = nodesRaw.length - 1;
  for (let i = 0; i < nodesRaw.length; i++) {
    const item = nodesRaw[i];
    if (!isRecord(item)) return null;
    const label = String(item.label ?? item.text ?? "").trim();
    if (!label) return null;
    nodes.push({
      id: String(item.id ?? i + 1),
      label,
      role: parseRole(item.role, i, last),
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: MechanismEdge[] = [];
  if (Array.isArray(edgesRaw)) {
    for (const item of edgesRaw) {
      if (!isRecord(item)) continue;
      const from = String(item.from ?? item.source ?? "").trim();
      const to = String(item.to ?? item.target ?? "").trim();
      if (!from || !to || !ids.has(from) || !ids.has(to)) continue;
      const label = item.label != null ? String(item.label).trim() : "";
      edges.push(label ? { from, to, label } : { from, to });
    }
  }
  if (edges.length === 0) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i]!.id, to: nodes[i + 1]!.id });
    }
  }
  return { nodes, edges };
}

function parsePanel(raw: unknown, index: number): MechanismPanelV1 | null {
  if (!isRecord(raw)) return null;
  const title = String(raw.title ?? raw.name ?? "").trim();
  const graph = parseMechanismGraph(raw.graph ?? raw);
  if (!title || !graph) return null;
  const id = PANEL_IDS[index] ?? "a";
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
    : undefined;
  const note = raw.note != null ? String(raw.note).trim() : "";
  return {
    id,
    title,
    graph,
    bullets: bullets && bullets.length > 0 ? bullets : undefined,
    note: note || undefined,
  };
}

function collectVisibleText(spec: Omit<MechanismSpecV1, "visibleText">): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => {
    const t = s?.trim();
    if (t) out.push(t);
  };
  const walk = (graph: MechanismGraph | undefined) => {
    if (!graph) return;
    for (const n of graph.nodes) push(n.label);
    for (const e of graph.edges) push(e.label);
  };
  if (spec.kind === "flow") walk(spec.graph);
  for (const p of spec.panels ?? []) {
    push(p.title);
    walk(p.graph);
    for (const b of p.bullets ?? []) push(b);
    push(p.note);
  }
  push(spec.note);
  return [...new Set(out)];
}

export function parseMechanismSpec(raw: unknown): MechanismSpecV1 | null {
  if (!isRecord(raw)) return null;
  const kind = String(raw.kind ?? "");
  if (!KINDS.has(kind)) return null;
  const caption = String(raw.caption ?? raw.title ?? "").trim();
  if (!caption) return null;
  const layoutRaw = String(raw.layout ?? "chain");
  const layout = LAYOUTS.has(layoutRaw) ? (layoutRaw as MechanismLayout) : "chain";
  const source = isRecord(raw.source) ? raw.source : {};
  const flowSteps = Array.isArray(source.flowSteps)
    ? source.flowSteps.map((s) => String(s).trim()).filter(Boolean)
    : undefined;
  const panelsSrc = Array.isArray(source.panels)
    ? source.panels.flatMap((item): MechanismPanelSource[] => {
        if (!isRecord(item)) return [];
        const title = String(item.title ?? "").trim();
        const steps = Array.isArray(item.steps)
          ? item.steps.map((s) => String(s).trim()).filter(Boolean)
          : [];
        if (!title || steps.length < 2) return [];
        return [{
          title,
          steps,
          bullets: Array.isArray(item.bullets)
            ? item.bullets.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
            : undefined,
          note: item.note != null ? String(item.note).trim() || undefined : undefined,
        }];
      })
    : undefined;

  const draft: Omit<MechanismSpecV1, "visibleText"> = {
    version: 1,
    kind: kind as MechanismRenderKind,
    claim: String(raw.claim ?? caption).trim() || caption,
    caption,
    journal: { preset: parseMechanismPreset(isRecord(raw.journal) ? raw.journal.preset : raw.preset) },
    layout,
    layoutLocked: raw.layoutLocked === true,
    graph: kind === "flow" ? parseMechanismGraph(raw.graph) ?? undefined : undefined,
    panels:
      kind === "mechanism_panel" && Array.isArray(raw.panels)
        ? raw.panels.map(parsePanel).filter((p): p is MechanismPanelV1 => p != null).slice(0, 3)
        : undefined,
    note: raw.note != null ? String(raw.note).trim() || undefined : undefined,
    source: {
      flowSteps: flowSteps && flowSteps.length >= 2 ? flowSteps : undefined,
      panels: panelsSrc && panelsSrc.length >= 2 ? panelsSrc : undefined,
      customGraph: source.customGraph === true,
    },
  };

  if (draft.kind === "flow" && (!draft.graph || draft.graph.nodes.length < 2)) return null;
  if (draft.kind === "mechanism_panel" && (!draft.panels || draft.panels.length < 2)) return null;

  return { ...draft, visibleText: collectVisibleText(draft) };
}

export function refreshMechanismVisibleText(spec: MechanismSpecV1): MechanismSpecV1 {
  const { visibleText: _drop, ...rest } = spec;
  return { ...spec, visibleText: collectVisibleText(rest) };
}

export function graphsOf(spec: MechanismSpecV1): MechanismGraph[] {
  if (spec.kind === "flow" && spec.graph) return [spec.graph];
  return (spec.panels ?? []).map((p) => p.graph);
}

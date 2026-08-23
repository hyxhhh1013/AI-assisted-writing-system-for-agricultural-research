/**
 * 松散 draft_mechanism_figure 意图 → MechanismSpecV1 + 确定性质检。
 * 边条件优先：步骤里的括号条件提升到 incoming edge，不堆在节点上。
 */
import type { MechanismQaFinding, MechanismQaReport } from "@/contracts/mechanism-qa";
import { buildMechanismQaReport } from "@/contracts/mechanism-qa";
import type {
  MechanismEdge,
  MechanismGraph,
  MechanismLayout,
  MechanismNode,
  MechanismNodeRole,
  MechanismPanelSource,
  MechanismPanelV1,
  MechanismPreset,
  MechanismSpecV1,
} from "@/contracts/mechanism-spec";
import {
  parseMechanismGraph,
  parseMechanismPreset,
  refreshMechanismVisibleText,
} from "@/contracts/mechanism-spec";

const MAX_NODE_CHARS = 28;
const CONDITION_HINT =
  /℃|°C|温度|催化剂|酸位|碱位|原位|异位|MPa|小时|min|预处理|热解|酸洗/;
const FRAMEWORK_HINT = /机理|框架|机制|综述|路径|调控/;
const ENGLISH_PLACEHOLDER =
  /\b(Pathway|Product|Feedstock|Support|Conversion|Upload figure asset)\b/i;
const UPLOAD_PLACEHOLDER = /Upload figure asset|虚线空框/i;

export interface CompileMechanismInput {
  kind: "flow" | "mechanism_panel";
  title: string;
  claim?: string;
  caption?: string;
  notes?: string;
  preset?: string;
  layout?: MechanismLayout;
  flowSteps?: string[];
  nodesJson?: unknown;
  edgesJson?: unknown;
  panelTitles?: string[];
  panels?: Array<{
    title: string;
    steps?: string[];
    bullets?: string[];
    note?: string;
  }>;
}

export interface CompileMechanismResult {
  spec: MechanismSpecV1;
  findings: MechanismQaFinding[];
  qaReport: MechanismQaReport;
}

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

/** 节点短语 + 边上条件。`催化热解（约500℃）` → label=催化热解, condition=约500℃ */
export function splitNodeCondition(step: string): { label: string; condition?: string } {
  const raw = step.trim();
  const m = raw.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
  if (!m) return { label: raw };
  const label = m[1]!.trim();
  const condition = m[2]!.trim();
  if (label.length < 2 || !condition) return { label: raw };
  return { label, condition };
}

function roleFor(index: number, last: number): MechanismNodeRole {
  return index === 0 || index === last ? "start_end" : "process";
}

function applyIncomingConditions(
  nodes: MechanismNode[],
  edges: MechanismEdge[],
  conditions: Map<string, string>,
): void {
  for (const edge of edges) {
    if (edge.label) continue;
    const cond = conditions.get(edge.to);
    if (cond) edge.label = cond;
  }
  if (nodes[0]) {
    const startCond = conditions.get(nodes[0].id);
    if (startCond && edges[0] && !edges[0].label) {
      edges[0].label = startCond;
    }
  }
}

export function buildChainGraph(steps: string[]): MechanismGraph {
  const split = steps.map(splitNodeCondition);
  const nodes: MechanismNode[] = split.map((s, i) => ({
    id: String(i + 1),
    label: s.label,
    role: roleFor(i, split.length - 1),
  }));
  const edges: MechanismEdge[] = split.slice(1).map((_, i) => ({
    from: String(i + 1),
    to: String(i + 2),
  }));
  const conditions = new Map<string, string>();
  split.forEach((s, i) => {
    if (s.condition) conditions.set(String(i + 1), s.condition);
  });
  applyIncomingConditions(nodes, edges, conditions);
  return { nodes, edges };
}

/**
 * ≥4 步分叉汇合：start → hub → 并行中段 → end。
 * 条件落到指向该节点的边上。
 */
export function buildForkGraph(steps: string[]): MechanismGraph {
  if (steps.length < 4) return buildChainGraph(steps);
  const split = steps.map(splitNodeCondition);
  const start = split[0]!;
  const hub = split[1]!;
  const end = split[split.length - 1]!;
  const mids = split.slice(2, -1);
  const nodes: MechanismNode[] = [
    { id: "1", label: start.label, role: "start_end" },
    { id: "2", label: hub.label, role: "process" },
    ...mids.map((s, i) => ({
      id: String(i + 3),
      label: s.label,
      role: "process" as const,
    })),
    { id: String(mids.length + 3), label: end.label, role: "start_end" },
  ];
  const endId = String(mids.length + 3);
  const edges: MechanismEdge[] = [{ from: "1", to: "2" }];
  for (let i = 0; i < mids.length; i++) {
    const midId = String(i + 3);
    edges.push({ from: "2", to: midId });
    edges.push({ from: midId, to: endId });
  }
  const conditions = new Map<string, string>();
  if (start.condition) conditions.set("1", start.condition);
  if (hub.condition) conditions.set("2", hub.condition);
  mids.forEach((s, i) => {
    if (s.condition) conditions.set(String(i + 3), s.condition);
  });
  if (end.condition) conditions.set(endId, end.condition);
  applyIncomingConditions(nodes, edges, conditions);
  return { nodes, edges };
}

/** 兼容旧测试：只返回分叉拓扑，不拆括号（调用方已是纯标签）。 */
export function buildForkFlow(steps: string[]): { nodes: MechanismNode[]; edges: MechanismEdge[] } {
  return buildForkGraph(steps);
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

function parseCustomGraph(nodesJson: unknown, edgesJson: unknown): MechanismGraph | null {
  const nodesArr = parseJsonArray(nodesJson);
  if (!nodesArr || nodesArr.length < 2) return null;
  return parseMechanismGraph({ nodes: nodesArr, edges: parseJsonArray(edgesJson) ?? [] });
}

function resolveLayout(
  input: CompileMechanismInput,
  stepCount: number,
  custom: boolean,
): { layout: MechanismLayout; locked: boolean } {
  if (custom) return { layout: "chain", locked: true };
  if (input.layout === "chain" || input.layout === "fork") {
    return { layout: input.layout, locked: true };
  }
  return { layout: stepCount >= 4 ? "fork" : "chain", locked: false };
}

function buildGraphForLayout(steps: string[], layout: MechanismLayout): MechanismGraph {
  return layout === "fork" && steps.length >= 4
    ? buildForkGraph(steps)
    : buildChainGraph(steps);
}

function attachNoteToFirstEdge(graph: MechanismGraph, notes: string): void {
  const short = notes.trim().slice(0, 24);
  if (!short || !graph.edges[0] || graph.edges[0].label) return;
  graph.edges[0] = { ...graph.edges[0], label: short };
}

function panelId(i: number): "a" | "b" | "c" {
  return (["a", "b", "c"] as const)[i] ?? "a";
}

function compileFlow(input: CompileMechanismInput): MechanismSpecV1 {
  const caption = (input.caption || input.title || "机理示意图").trim() || "机理示意图";
  const claim = (input.claim || caption).trim();
  const notes = (input.notes ?? "").trim();
  const preset: MechanismPreset = parseMechanismPreset(input.preset);
  const custom = parseCustomGraph(input.nodesJson, input.edgesJson);
  const steps = (input.flowSteps ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8);

  if (custom) {
    if (notes) attachNoteToFirstEdge(custom, notes);
    return refreshMechanismVisibleText({
      version: 1,
      kind: "flow",
      claim,
      caption,
      journal: { preset },
      layout: "chain",
      layoutLocked: true,
      visibleText: [],
      graph: custom,
      note: notes || undefined,
      source: { customGraph: true },
    });
  }

  const usedSteps = steps.length >= 2 ? steps : defaultStepsForPanelTitle(caption);
  const { layout, locked } = resolveLayout(input, usedSteps.length, false);
  const graph = buildGraphForLayout(usedSteps, layout);
  if (steps.length < 2 && notes) attachNoteToFirstEdge(graph, notes);

  return refreshMechanismVisibleText({
    version: 1,
    kind: "flow",
    claim,
    caption,
    journal: { preset },
    layout,
    layoutLocked: locked,
    visibleText: [],
    graph,
    note: notes || undefined,
    source: { flowSteps: usedSteps },
  });
}

function compilePanel(input: CompileMechanismInput): MechanismSpecV1 {
  const caption = (input.caption || input.title || "机理示意图").trim() || "机理示意图";
  const claim = (input.claim || caption).trim();
  const notes = (input.notes ?? "").trim();
  const preset: MechanismPreset = parseMechanismPreset(input.preset);

  let sources: MechanismPanelSource[] = (input.panels ?? [])
    .map((p) => ({
      title: p.title.trim(),
      steps: (p.steps ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      bullets: p.bullets?.map((s) => s.trim()).filter(Boolean).slice(0, 3),
      note: p.note?.trim() || undefined,
    }))
    .filter((p) => p.title)
    .slice(0, 3);

  if (sources.length < 2) {
    const titles =
      (input.panelTitles ?? []).filter(Boolean).slice(0, 3);
    const fallback = titles.length >= 2 ? titles : ["组成与结构", "活性位与路径", "产物导向"];
    while (fallback.length < 2) fallback.push(`路径 ${fallback.length + 1}`);
    sources = fallback.slice(0, 3).map((title) => ({
      title,
      steps: defaultStepsForPanelTitle(title),
    }));
  }

  const maxSteps = Math.max(...sources.map((s) => {
    const steps = s.steps.length >= 2 ? s.steps : defaultStepsForPanelTitle(s.title);
    return steps.length;
  }));
  const { layout, locked } = resolveLayout(input, maxSteps, false);

  let noteUsed = false;
  const panels: MechanismPanelV1[] = sources.map((src, i) => {
    const steps = src.steps.length >= 2 ? src.steps : defaultStepsForPanelTitle(src.title);
    const graph = buildGraphForLayout(steps, layout);
    const panelNote = src.note;
    let note = panelNote;
    if (!note && notes && i === sources.length - 1 && !noteUsed) {
      note = notes;
      noteUsed = true;
    } else if (panelNote) {
      noteUsed = true;
    }
    return {
      id: panelId(i),
      title: src.title,
      graph,
      bullets: src.bullets && src.bullets.length > 0 ? src.bullets : undefined,
      note,
    };
  });

  return refreshMechanismVisibleText({
    version: 1,
    kind: "mechanism_panel",
    claim,
    caption,
    journal: { preset },
    layout,
    layoutLocked: locked,
    visibleText: [],
    panels,
    note: notes || undefined,
    source: { panels: sources },
  });
}

function labeledEdgeRatio(graph: MechanismGraph): { labeled: number; total: number } {
  const processEdges = graph.edges.filter((e) => {
    const from = graph.nodes.find((n) => n.id === e.from);
    const to = graph.nodes.find((n) => n.id === e.to);
    return from?.role !== "start_end" || to?.role !== "start_end";
  });
  const total = processEdges.length || graph.edges.length;
  const labeled = (processEdges.length ? processEdges : graph.edges)
    .filter((e) => Boolean(e.label?.trim())).length;
  return { labeled, total };
}

function hasParallelEdges(graph: MechanismGraph): boolean {
  const seen = new Map<string, number>();
  for (const e of graph.edges) {
    seen.set(e.from, (seen.get(e.from) ?? 0) + 1);
  }
  return [...seen.values()].some((n) => n >= 2);
}

function inspectGraphFindings(
  graph: MechanismGraph,
  ctx: { title: string; claim: string; notes: string; expectFramework: boolean },
): MechanismQaFinding[] {
  const findings: MechanismQaFinding[] = [];
  for (const n of graph.nodes) {
    if (ENGLISH_PLACEHOLDER.test(n.label)) {
      findings.push({
        code: "english_placeholder",
        layer: "L5",
        action: "block",
        message: `节点「${n.label}」是英文占位，请改成中文过程短语`,
      });
    }
    if (UPLOAD_PLACEHOLDER.test(n.label)) {
      findings.push({
        code: "upload_placeholder",
        layer: "L5",
        action: "block",
        message: "节点含 Upload / 空占位，禁止入库",
      });
    }
    if ([...n.label].length > MAX_NODE_CHARS) {
      findings.push({
        code: "node_overload",
        layer: "L2",
        action: "repair",
        message: `节点「${n.label.slice(0, 12)}…」超过 ${MAX_NODE_CHARS} 字，应缩成图注短语`,
      });
    }
    if (ctx.claim.length >= 8 && n.label === ctx.claim) {
      findings.push({
        code: "claim_on_figure",
        layer: "L4",
        action: "repair",
        message: "主张整句写进了节点；主张进 caption，节点只留过程短语",
      });
    }
  }
  for (const e of graph.edges) {
    if (e.label && ENGLISH_PLACEHOLDER.test(e.label)) {
      findings.push({
        code: "english_placeholder",
        layer: "L5",
        action: "block",
        message: `边标签「${e.label}」是英文占位`,
      });
    }
  }

  if (ctx.expectFramework && graph.nodes.length <= 3 && !hasParallelEdges(graph)) {
    findings.push({
      code: "structure_too_simple",
      layer: "L2",
      action: "repair",
      message: "自称框架/机理却只有单列短链；≥4 步应分叉或补并行边",
    });
  }

  const hay = `${ctx.title} ${ctx.claim} ${ctx.notes} ${graph.nodes.map((n) => n.label).join(" ")}`;
  if (CONDITION_HINT.test(hay)) {
    const { labeled, total } = labeledEdgeRatio(graph);
    if (total >= 1 && labeled / total < 0.5) {
      findings.push({
        code: "missing_edge_condition",
        layer: "L4",
        action: "repair",
        message: "文中有温度/催化剂等条件，但多数边没有标签；条件应上箭头",
      });
    }
  }

  return findings;
}

export function inspectMechanismSpec(spec: MechanismSpecV1): MechanismQaFinding[] {
  const findings: MechanismQaFinding[] = [];
  const expectFramework = FRAMEWORK_HINT.test(`${spec.caption} ${spec.claim}`);
  const notes = spec.note ?? "";

  if (spec.kind === "flow" && spec.graph) {
    if (spec.graph.nodes.length < 2) {
      findings.push({
        code: "empty_panel",
        layer: "L5",
        action: "block",
        message: "流程图节点不足 2 个",
      });
    } else {
      findings.push(...inspectGraphFindings(spec.graph, {
        title: spec.caption,
        claim: spec.claim,
        notes,
        expectFramework,
      }));
    }
  }

  if (spec.kind === "mechanism_panel") {
    const panels = spec.panels ?? [];
    if (panels.length < 2) {
      findings.push({
        code: "empty_panel",
        layer: "L5",
        action: "block",
        message: "多面板至少需要 2 栏",
      });
    }
    const counts: number[] = [];
    for (const p of panels) {
      counts.push(p.graph.nodes.length);
      if (p.graph.nodes.length < 2) {
        findings.push({
          code: "empty_panel",
          layer: "L5",
          action: "block",
          message: `栏 ${p.id}「${p.title}」节点不足 2 个`,
        });
        continue;
      }
      if (ENGLISH_PLACEHOLDER.test(p.title)) {
        findings.push({
          code: "english_placeholder",
          layer: "L5",
          action: "block",
          message: `栏标题「${p.title}」是英文占位`,
        });
      }
      findings.push(...inspectGraphFindings(p.graph, {
        title: p.title,
        claim: spec.claim,
        notes: p.note ?? notes,
        expectFramework,
      }));
      const note = p.note?.trim();
      if (note && p.graph.nodes.some((n) => n.label === note)) {
        findings.push({
          code: "duplicate_text",
          layer: "L2",
          action: "repair",
          message: `栏 ${p.id} 的 callout 与节点原文重复`,
        });
      }
    }
    if (panels.length >= 3 && counts.length === panels.length) {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      if (max - min >= 3) {
        findings.push({
          code: "panel_imbalance",
          layer: "L2",
          action: "warn",
          message: `三栏节点数相差 ${max - min}，建议补短栏或收长栏`,
        });
      }
    }
  }

  return findings;
}

export function compileMechanismSpec(input: CompileMechanismInput): CompileMechanismResult {
  const spec = input.kind === "flow" ? compileFlow(input) : compilePanel(input);
  const findings = inspectMechanismSpec(spec);
  return { spec, findings, qaReport: buildMechanismQaReport(findings) };
}

export function rebuildMechanismLayout(spec: MechanismSpecV1, layout: MechanismLayout): MechanismSpecV1 {
  if (spec.source.customGraph) return spec;
  if (spec.kind === "flow" && spec.source.flowSteps && spec.source.flowSteps.length >= 2) {
    return refreshMechanismVisibleText({
      ...spec,
      layout,
      graph: buildGraphForLayout(spec.source.flowSteps, layout),
    });
  }
  if (spec.kind === "mechanism_panel" && spec.source.panels) {
    const panels = spec.panels ?? [];
    return refreshMechanismVisibleText({
      ...spec,
      layout,
      panels: panels.map((p, i) => {
        const src = spec.source.panels?.[i];
        const steps = src?.steps && src.steps.length >= 2
          ? src.steps
          : p.graph.nodes.map((n) => n.label);
        return { ...p, graph: buildGraphForLayout(steps, layout) };
      }),
    });
  }
  return spec;
}

/** 未锁布局且 ≥4 步时给出另一套版式，供人挑选。 */
export function buildAlternateLayoutSpec(spec: MechanismSpecV1): MechanismSpecV1 | null {
  if (spec.layoutLocked || spec.source.customGraph) return null;
  const steps = spec.source.flowSteps
    ?? spec.source.panels?.flatMap((p) => p.steps)
    ?? [];
  if (steps.length < 4 && !(spec.source.panels ?? []).some((p) => p.steps.length >= 4)) {
    return null;
  }
  const other: MechanismLayout = spec.layout === "fork" ? "chain" : "fork";
  const alt = rebuildMechanismLayout(spec, other);
  return alt.layout === spec.layout ? null : alt;
}

export function mechanismSpecToRenderConfig(spec: MechanismSpecV1): Record<string, unknown> {
  if (spec.kind === "flow" && spec.graph) {
    return {
      title: spec.caption,
      preset: spec.journal.preset,
      direction: "vertical",
      look: "journal",
      nodes: spec.graph.nodes,
      edges: spec.graph.edges,
    };
  }

  const panels = (spec.panels ?? []).map((p) => {
    const blocks: Array<Record<string, unknown>> = [];
    if (p.bullets?.length) {
      blocks.push({ type: "text", content: p.bullets.join("；") });
    }
    blocks.push({
      type: "flow_subgraph",
      direction: "vertical",
      nodes: p.graph.nodes,
      edges: p.graph.edges,
    });
    if (p.note) {
      blocks.push({ type: "callout", content: p.note });
    }
    return { id: p.id, title: p.title, blocks };
  });

  return { title: spec.caption, preset: spec.journal.preset, panels };
}

/** 旧 builder 兼容：编译后吐 Python config */
export function buildFlowDiagramConfig(input: {
  title: string;
  notes: string;
  flowSteps?: string[];
  layout?: "chain" | "fork" | "custom";
  nodesJson?: unknown;
  edgesJson?: unknown;
}): Record<string, unknown> {
  const { spec } = compileMechanismSpec({
    kind: "flow",
    title: input.title,
    notes: input.notes,
    flowSteps: input.flowSteps,
    layout: input.layout === "chain" || input.layout === "fork" ? input.layout : undefined,
    nodesJson: input.nodesJson,
    edgesJson: input.edgesJson,
  });
  return mechanismSpecToRenderConfig(spec);
}

export function buildMechanismPanelConfig(input: {
  title: string;
  panelTitles: string[];
  notes: string;
  panels?: Array<{
    title: string;
    steps?: string[];
    bullets?: string[];
    note?: string;
  }>;
}): Record<string, unknown> {
  const { spec } = compileMechanismSpec({
    kind: "mechanism_panel",
    title: input.title,
    notes: input.notes,
    panelTitles: input.panelTitles,
    panels: input.panels,
  });
  return mechanismSpecToRenderConfig(spec);
}

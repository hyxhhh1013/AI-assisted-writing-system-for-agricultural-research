/**
 * FIG-MECH-QA：qa findings → MechanismSpec 补丁（纯函数）。
 * 改节点/边/布局，不重掷整图。
 */
import type { MechanismQaFinding } from "@/contracts/mechanism-qa";
import type { MechanismGraph, MechanismSpecV1 } from "@/contracts/mechanism-spec";
import { refreshMechanismVisibleText } from "@/contracts/mechanism-spec";
import { rebuildMechanismLayout, splitNodeCondition } from "@/lib/mechanism-spec-compiler";

export interface MechanismSpecPatch {
  code: string;
  path: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface ApplyMechanismSpecPatchesResult {
  spec: MechanismSpecV1;
  patches: MechanismSpecPatch[];
}

const ENGLISH_MAP: Array<[RegExp, string]> = [
  [/\bPathway\b/gi, "路径"],
  [/\bProduct\b/gi, "产物"],
  [/\bFeedstock\b/gi, "原料"],
  [/\bSupport\b/gi, "载体"],
  [/\bConversion\b/gi, "转化"],
];

function cloneSpec(spec: MechanismSpecV1): MechanismSpecV1 {
  return JSON.parse(JSON.stringify(spec)) as MechanismSpecV1;
}

function addPatch(
  patches: MechanismSpecPatch[],
  code: string,
  path: string,
  before: MechanismSpecPatch["before"],
  after: MechanismSpecPatch["after"],
): void {
  if (before === after) return;
  patches.push({ code, path, before, after });
}

function shortenLabel(label: string, max = 24): string {
  const chars = [...label];
  if (chars.length <= max) return label;
  return `${chars.slice(0, max - 1).join("")}…`;
}

function replaceEnglish(text: string): string {
  let next = text;
  for (const [re, zh] of ENGLISH_MAP) {
    next = next.replace(re, zh);
  }
  return next.replace(/Upload figure asset/gi, "待补素材").trim();
}

function patchGraph(
  graph: MechanismGraph,
  claim: string,
  notes: string,
  findings: readonly MechanismQaFinding[],
  pathPrefix: string,
  patches: MechanismSpecPatch[],
): void {
  const codes = new Set(findings.map((f) => f.code));

  if (codes.has("english_placeholder") || codes.has("upload_placeholder")) {
    for (const n of graph.nodes) {
      const next = replaceEnglish(n.label);
      if (next !== n.label) {
        addPatch(patches, "english_placeholder", `${pathPrefix}.node.${n.id}`, n.label, next);
        n.label = next;
      }
    }
    for (const e of graph.edges) {
      if (!e.label) continue;
      const next = replaceEnglish(e.label);
      if (next !== e.label) {
        addPatch(patches, "english_placeholder", `${pathPrefix}.edge.${e.from}-${e.to}`, e.label, next);
        e.label = next;
      }
    }
  }

  if (codes.has("node_overload")) {
    for (const n of graph.nodes) {
      if ([...n.label].length <= 28) continue;
      const next = shortenLabel(n.label);
      addPatch(patches, "node_overload", `${pathPrefix}.node.${n.id}`, n.label, next);
      n.label = next;
    }
  }

  if (codes.has("claim_on_figure")) {
    for (const n of graph.nodes) {
      if (claim.length >= 8 && n.label === claim) {
        const next = n.role === "start_end" ? "起点" : "过程";
        addPatch(patches, "claim_on_figure", `${pathPrefix}.node.${n.id}`, n.label, next);
        n.label = next;
      }
    }
  }

  if (codes.has("missing_edge_condition")) {
    for (const n of graph.nodes) {
      const split = splitNodeCondition(n.label);
      if (!split.condition) continue;
      const incoming = graph.edges.find((e) => e.to === n.id && !e.label);
      if (incoming) {
        addPatch(patches, "missing_edge_condition", `${pathPrefix}.edge.${incoming.from}-${incoming.to}`, null, split.condition);
        incoming.label = split.condition;
        if (split.label !== n.label) {
          addPatch(patches, "missing_edge_condition", `${pathPrefix}.node.${n.id}`, n.label, split.label);
          n.label = split.label;
        }
      }
    }
    const shortNote = notes.trim().slice(0, 24);
    const unlabeled = graph.edges.find((e) => !e.label);
    if (shortNote && unlabeled && !graph.edges.some((e) => e.label === shortNote)) {
      addPatch(patches, "missing_edge_condition", `${pathPrefix}.edge.${unlabeled.from}-${unlabeled.to}`, null, shortNote);
      unlabeled.label = shortNote;
    }
  }
}

export function isMechanismPatchable(finding: MechanismQaFinding): boolean {
  if (finding.action === "repair") return true;
  return finding.action === "block"
    && (finding.code === "english_placeholder" || finding.code === "upload_placeholder");
}

export function applyMechanismSpecPatches(
  spec: MechanismSpecV1,
  findings: readonly MechanismQaFinding[],
): ApplyMechanismSpecPatchesResult {
  const patchable = findings.filter(isMechanismPatchable);
  const next = cloneSpec(spec);
  const patches: MechanismSpecPatch[] = [];
  const codes = new Set(patchable.map((f) => f.code));

  if (next.kind === "flow" && next.graph) {
    patchGraph(next.graph, next.claim, next.note ?? "", patchable, "graph", patches);
  }
  if (next.kind === "mechanism_panel") {
    for (const p of next.panels ?? []) {
      patchGraph(p.graph, next.claim, p.note ?? next.note ?? "", patchable, `panel.${p.id}`, patches);
      if (codes.has("english_placeholder")) {
        const title = replaceEnglish(p.title);
        if (title !== p.title) {
          addPatch(patches, "english_placeholder", `panel.${p.id}.title`, p.title, title);
          p.title = title;
        }
      }
      if (codes.has("duplicate_text") && p.note) {
        if (p.graph.nodes.some((n) => n.label === p.note)) {
          addPatch(patches, "duplicate_text", `panel.${p.id}.note`, p.note, null);
          p.note = undefined;
        }
      }
    }
  }

  if (codes.has("structure_too_simple") && !next.layoutLocked) {
    const stepCount = next.source.flowSteps?.length
      ?? Math.max(0, ...(next.source.panels ?? []).map((p) => p.steps.length));
    if (stepCount >= 4 && next.layout !== "fork") {
      addPatch(patches, "structure_too_simple", "layout", next.layout, "fork");
      const forked = rebuildMechanismLayout(next, "fork");
      return { spec: refreshMechanismVisibleText(forked), patches };
    }
  }

  return { spec: refreshMechanismVisibleText(next), patches };
}

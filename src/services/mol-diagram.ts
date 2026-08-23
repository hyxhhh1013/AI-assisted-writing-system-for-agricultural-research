/** 分子结构图 API 类型定义与服务封装 */

import type { MechanismQaReport } from "@/contracts/mechanism-qa";
import type { MechanismSpecV1 } from "@/contracts/mechanism-spec";

export interface MolDiagramResponse {
  imageBase64: string;
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  preset?: string;
  qaReport?: MechanismQaReport;
  mechanismSpec?: MechanismSpecV1;
  specPatches?: Array<{ code: string; path: string }>;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
}

export interface MolAtom {
  element: string;
  x: number;
  y: number;
}

export interface MolBond {
  atom1: number;
  atom2: number;
  type: number;
}

export interface MolInfo {
  formula: string;
  molWeight: number;
  nAtoms: number;
  nBonds: number;
  logP?: number;
}

/** 单个分子渲染配置 */
export interface MolConfig {
  smiles: string;
  label?: string;
  size?: number;
}

/** 多分子反应式配置 */
export interface ReactionConfig {
  title?: string;
  reactants: MolConfig[];
  products: MolConfig[];
  conditions?: string;
  arrow?: string;
}

export interface MolDiagramData {
  mols: MolInfo[];
  reaction_smiles?: string;
}

export async function renderMolecule(
  config: MolConfig,
  signal?: AbortSignal,
): Promise<MolDiagramResponse & { data: MolInfo }> {
  const res = await fetch("/api/mol-diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "mol", config }),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "分子渲染失败");
  return json;
}

export interface FlowNode {
  id: string;
  label: string;
  shape?: "box" | "oval" | "diamond";
  role?: "process" | "decision" | "start_end" | "callout";
  color?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export type FlowPreset = "nature" | "agr_journal" | "print_bw";

export interface FlowConfig {
  title?: string;
  direction?: "vertical" | "horizontal";
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** @deprecated 使用 columns；保留兼容旧调用 */
  cols?: number;
  /** 栏宽：1=单栏，2=双栏（对齐 plotstyle / Nature 刊规） */
  columns?: number;
  /** journal=白底细线（默认）；vivid=浅色强调 */
  look?: "journal" | "vivid";
  /** ortho | polyline | spline */
  splines?: string;
  colors?: Record<string, string>;
  default_color?: string;
  renderer?: "matplotlib" | "graphviz";
  preset?: FlowPreset;
  export_formats?: string | string[];
  panel_label?: string;
}

export async function renderFlowChart(
  config: FlowConfig,
  signal?: AbortSignal,
): Promise<MolDiagramResponse> {
  const res = await fetch("/api/flow-diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      renderer: "graphviz",
      preset: "nature",
      export_formats: "png,svg,pdf",
      ...config,
    }),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "流程图渲染失败");
  return json;
}

/** 保存前端渲染的图片（PNG base64）到服务器 */
export async function saveChartImage(
  imageBase64: string,
  signal?: AbortSignal,
): Promise<MolDiagramResponse> {
  const res = await fetch("/api/save-chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "保存失败");
  return json;
}

export async function renderReaction(
  config: ReactionConfig,
  signal?: AbortSignal,
): Promise<MolDiagramResponse & { data: MolDiagramData }> {
  const res = await fetch("/api/mol-diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "reaction", config }),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "反应式渲染失败");
  return json;
}

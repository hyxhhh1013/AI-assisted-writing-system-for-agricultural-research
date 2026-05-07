/** 分子结构图 API 类型定义与服务封装 */

export interface MolDiagramResponse {
  imageBase64: string;
  imageUrl: string;
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
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowConfig {
  title?: string;
  direction?: "vertical" | "horizontal";
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols?: number;
}

export async function renderFlowChart(
  config: FlowConfig,
  signal?: AbortSignal,
): Promise<MolDiagramResponse> {
  const res = await fetch("/api/flow-diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
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

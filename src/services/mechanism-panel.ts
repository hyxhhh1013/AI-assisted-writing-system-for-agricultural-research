/** 多面板机理图合成 */

import type { MechanismQaReport } from "@/contracts/mechanism-qa";
import type { MechanismSpecV1 } from "@/contracts/mechanism-spec";

export interface MechanismPanelBlock {
  type: "text" | "image" | "molecule" | "flow_subgraph" | "callout";
  content?: string;
  text?: string;
  caption?: string;
  assetKey?: string;
  path?: string;
  smiles?: string;
  label?: string;
  height?: number;
  title?: string;
  direction?: "vertical" | "horizontal";
  nodes?: { id: string; label: string; shape?: string; role?: string; color?: string }[];
  edges?: { from: string; to: string; label?: string }[];
}

export interface MechanismPanelColumn {
  id: string;
  title: string;
  footnote?: string;
  blocks: MechanismPanelBlock[];
}

export interface MechanismPanelConfig {
  title?: string;
  preset?: "nature" | "agr_journal" | "print_bw";
  fig_width?: number;
  fig_height?: number;
  dpi?: number;
  panels: MechanismPanelColumn[];
}

export interface MechanismPanelResponse {
  imageBase64: string;
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  qaReport?: MechanismQaReport;
  mechanismSpec?: MechanismSpecV1;
  specPatches?: Array<{ code: string; path: string }>;
  panels?: MechanismPanelColumn[];
}

export async function renderMechanismPanel(
  config: MechanismPanelConfig,
  assets?: Record<string, File>,
  signal?: AbortSignal,
): Promise<MechanismPanelResponse> {
  if (assets && Object.keys(assets).length > 0) {
    const fd = new FormData();
    fd.append("config", JSON.stringify(config));
    for (const [key, file] of Object.entries(assets)) {
      fd.append(key, file);
    }
    const res = await fetch("/api/mechanism-panel", { method: "POST", body: fd, signal });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "多面板合成失败");
    return json;
  }

  const res = await fetch("/api/mechanism-panel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "多面板合成失败");
  return json;
}

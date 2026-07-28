import type { BgParams } from "@/services/xrd";

export interface XpsAtomPreset {
  element: string;
  orbital: string;
  energy: string;
}

export interface XpsRegionPreset {
  id: string;
  label: string;
  energyMin: string;
  energyMax: string;
  atoms: XpsAtomPreset[];
}

/** 窄区扫描常用模板（结合能 eV，CasaXPS 惯例） */
export const XPS_REGION_PRESETS: XpsRegionPreset[] = [
  {
    id: "c1s",
    label: "C 1s",
    energyMin: "280",
    energyMax: "294",
    atoms: [
      { element: "C", orbital: "1s1/2", energy: "284.8" },
      { element: "C", orbital: "1s1/2", energy: "286.5" },
      { element: "C", orbital: "1s1/2", energy: "288.5" },
    ],
  },
  {
    id: "n1s",
    label: "N 1s",
    energyMin: "395",
    energyMax: "408",
    atoms: [
      { element: "N", orbital: "1s1/2", energy: "398.5" },
      { element: "N", orbital: "1s1/2", energy: "400.2" },
      { element: "N", orbital: "1s1/2", energy: "402.0" },
    ],
  },
  {
    id: "o1s",
    label: "O 1s",
    energyMin: "527",
    energyMax: "538",
    atoms: [
      { element: "O", orbital: "1s1/2", energy: "530.0" },
      { element: "O", orbital: "1s1/2", energy: "531.5" },
      { element: "O", orbital: "1s1/2", energy: "533.0" },
    ],
  },
  {
    id: "s2p",
    label: "S 2p",
    energyMin: "161",
    energyMax: "172",
    atoms: [
      { element: "S", orbital: "2p3/2", energy: "163.8" },
      { element: "S", orbital: "2p3/2", energy: "165.0" },
      { element: "S", orbital: "2p1/2", energy: "164.9" },
    ],
  },
  {
    id: "cu2p",
    label: "Cu 2p",
    energyMin: "925",
    energyMax: "960",
    atoms: [
      { element: "Cu2+", orbital: "2p3/2", energy: "934.6" },
      { element: "Cu2+", orbital: "2p1/2", energy: "954.4" },
      { element: "Cu+", orbital: "2p3/2", energy: "932.6" },
    ],
  },
];

export type XpsBgPresetId = "default" | "shirley" | "linear" | "smooth";

export const XPS_BG_PRESETS: { id: XpsBgPresetId; label: string; params: BgParams }[] = [
  {
    id: "default",
    label: "默认 (TwiceFilter)",
    params: { LFctg: 0.3, window_length: 15, polyorder: 3, bac_var_type: "constant" },
  },
  {
    id: "shirley",
    label: "Shirley 型",
    params: { LFctg: 0.25, window_length: 21, polyorder: 3, bac_var_type: "constant", bac_split: 5 },
  },
  {
    id: "linear",
    label: "线性背景",
    params: { LFctg: 0.3, window_length: 15, polyorder: 1, bac_var_type: "polynomial" },
  },
  {
    id: "smooth",
    label: "平滑扣除",
    params: { LFctg: 0.45, window_length: 25, polyorder: 3, bac_var_type: "constant" },
  },
];

export function bgParamsFromPreset(presetId: XpsBgPresetId): BgParams {
  return XPS_BG_PRESETS.find((p) => p.id === presetId)?.params ?? XPS_BG_PRESETS[0].params;
}

export interface XpsComponentRow {
  index: number;
  mu: number;
  fwhm: number;
  weight: number;
  area: number;
}

/** 由峰权重估算相对原子百分比（归一化 weight） */
export function computeXpsQuantRows(
  components: Array<{ mu: number; fwhm: number; weight: number; sigma2: number }>,
): XpsComponentRow[] {
  const weights = components.map((c) => Math.max(c.weight, 0));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  return components.map((c, i) => ({
    index: i + 1,
    mu: c.mu,
    fwhm: c.fwhm,
    weight: c.weight,
    area: (weights[i] / total) * 100,
  }));
}

export function buildXpsQuantTableHtml(title: string, rows: XpsComponentRow[]): string {
  const cap = title.trim() || "XPS 峰拟合定量结果";
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${r.index}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${r.mu.toFixed(2)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${r.fwhm.toFixed(3)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${r.area.toFixed(1)}</td></tr>`,
    )
    .join("");
  return (
    `<table style="border-collapse:collapse;width:100%;font-size:12px;margin:8px 0">` +
    `<caption style="caption-side:top;text-align:center;font-weight:600;margin-bottom:6px">${cap}</caption>` +
    `<thead><tr>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">峰 #</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">BE (eV)</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">FWHM (eV)</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">相对含量 (%)</th>` +
    `</tr></thead><tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="4" style="border-bottom:2px solid #333;height:2px;padding:0"></td></tr></tfoot>` +
    `</table>`
  );
}

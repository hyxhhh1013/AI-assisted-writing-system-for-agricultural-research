import type { PeakInfo, ScherrerPeakResult } from "@/services/xrd";

export type XrdWorkflowStep = "import" | "stack" | "peakfit" | "scherrer";

export const XRD_WORKFLOW_STEPS: { id: XrdWorkflowStep; label: string; hint: string }[] = [
  { id: "import", label: "导入", hint: "上传 .xy / CSV，可多文件" },
  { id: "stack", label: "叠加", hint: "多样品 offset 对比" },
  { id: "peakfit", label: "峰拟合", hint: "背景扣除与峰检测" },
  { id: "scherrer", label: "Scherrer", hint: "晶粒尺寸估算" },
];

export function fileBaseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "");
}

/** 取峰 FWHM，缺失时用默认值 */
export function resolvePeakFwhm(peak: PeakInfo, defaultFwhm: number): number {
  if (peak.fwhm != null && peak.fwhm > 0 && Number.isFinite(peak.fwhm)) {
    return peak.fwhm;
  }
  return defaultFwhm;
}

/** 峰检测结果 → Scherrer 峰表文本（优先使用实测 FWHM） */
export function peaksToScherrerText(peaks: PeakInfo[], defaultFwhm = 0.25): string {
  return peaks
    .slice(0, 12)
    .map((p, i) => {
      const fwhm = resolvePeakFwhm(p, defaultFwhm);
      return `Peak${i + 1}, ${p.two_theta.toFixed(2)}, ${fwhm.toFixed(3)}`;
    })
    .join("\n");
}

export function peaksHaveFwhm(peaks: PeakInfo[]): boolean {
  return peaks.some((p) => p.fwhm != null && p.fwhm > 0);
}

export function parseScherrerPeakText(text: string): {
  two_theta: number;
  fwhm: number;
  label?: string;
}[] {
  const peaks: { two_theta: number; fwhm: number; label?: string }[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/[,，\t]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts.length >= 3 && Number.isNaN(parseFloat(parts[0]))) {
      const two = parseFloat(parts[1]);
      const fwhm = parseFloat(parts[2]);
      if (!Number.isNaN(two) && !Number.isNaN(fwhm)) {
        peaks.push({ label: parts[0], two_theta: two, fwhm });
      }
    } else {
      const two = parseFloat(parts[0]);
      const fwhm = parseFloat(parts[1]);
      if (!Number.isNaN(two) && !Number.isNaN(fwhm)) {
        peaks.push({ label: parts[2] || undefined, two_theta: two, fwhm });
      }
    }
  }
  return peaks;
}

export function buildXrdPeakTableHtml(title: string, peaks: PeakInfo[]): string {
  const cap = title.trim() || "XRD 衍射峰表";
  const showFwhm = peaksHaveFwhm(peaks);
  const body = peaks
    .map((p, i) => {
      let row =
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${i + 1}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.two_theta.toFixed(3)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.intensity.toFixed(1)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.relative_intensity.toFixed(1)}</td>`;
      if (showFwhm) {
        const fwhm =
          p.fwhm != null && p.fwhm > 0 ? p.fwhm.toFixed(3) : "—";
        row += `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${fwhm}</td>`;
      }
      return `${row}</tr>`;
    })
    .join("");
  const fwhmHead = showFwhm
    ? `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">FWHM (°)</th>`
    : "";
  const colspan = showFwhm ? 5 : 4;
  return (
    `<table style="border-collapse:collapse;width:100%;font-size:12px;margin:8px 0">` +
    `<caption style="caption-side:top;text-align:center;font-weight:600;margin-bottom:6px">${cap}</caption>` +
    `<thead><tr>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">#</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">2θ (°)</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">Intensity</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">Rel. Int. (%)</th>` +
    fwhmHead +
    `</tr></thead><tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="${colspan}" style="border-bottom:2px solid #333;height:2px;padding:0"></td></tr></tfoot>` +
    `</table>`
  );
}

export interface PhaseMatchRow {
  phase_id: string;
  name: string;
  formula: string;
  score: number;
  matched_count: number;
  ref_peak_count: number;
}

export function buildPhaseMatchTableHtml(title: string, matches: PhaseMatchRow[]): string {
  const cap = title.trim() || "XRD 相检索结果";
  const body = matches
    .map(
      (m, i) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${i + 1}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333">${m.name}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${m.formula}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${(m.score * 100).toFixed(0)}%</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${m.matched_count}/${m.ref_peak_count}</td></tr>`,
    )
    .join("");
  return (
    `<table style="border-collapse:collapse;width:100%;font-size:12px;margin:8px 0">` +
    `<caption style="caption-side:top;text-align:center;font-weight:600;margin-bottom:6px">${cap}</caption>` +
    `<thead><tr>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">#</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">相</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">化学式</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">匹配度</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">匹配峰</th>` +
    `</tr></thead><tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="5" style="border-bottom:2px solid #333;height:2px;padding:0"></td></tr></tfoot>` +
    `</table>`
  );
}

export function buildScherrerResultTableHtml(title: string, peaks: ScherrerPeakResult[], meanNm: number): string {
  const cap = title.trim() || "Scherrer 晶粒尺寸";
  const body = peaks
    .map(
      (p) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.label}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.two_theta.toFixed(2)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.fwhm.toFixed(3)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #333;text-align:center">${p.size_nm.toFixed(1)}</td></tr>`,
    )
    .join("");
  return (
    `<table style="border-collapse:collapse;width:100%;font-size:12px;margin:8px 0">` +
    `<caption style="caption-side:top;text-align:center;font-weight:600;margin-bottom:6px">${cap}（平均 ${meanNm.toFixed(1)} nm）</caption>` +
    `<thead><tr>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">峰</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">2θ (°)</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">FWHM (°)</th>` +
    `<th style="padding:4px 8px;border-top:2px solid #333;border-bottom:1px solid #333">D (nm)</th>` +
    `</tr></thead><tbody>${body}</tbody>` +
    `<tfoot><tr><td colspan="4" style="border-bottom:2px solid #333;height:2px;padding:0"></td></tr></tfoot>` +
    `</table>`
  );
}

import { describe, expect, it } from "vitest";
import {
  buildChartExportManifest,
  journalWidthWithinTol,
  mmToInch,
  resolveJournalPack,
} from "@/contracts/chart-export";

describe("chart-export journal pack", () => {
  it("matches Python nature single / agr_journal double widths", () => {
    expect(mmToInch(89)).toBe(3.504);
    expect(mmToInch(170)).toBe(6.693);
    const nature = resolveJournalPack("nature", 1);
    expect(nature.widthMm).toBe(89);
    expect(nature.widthIn).toBe(3.504);
    expect(nature.dpi).toBe(300);
    expect(nature.exportFormats).toEqual(["png", "svg", "pdf"]);
    const agr = resolveJournalPack("agr_journal", 2);
    expect(agr.widthMm).toBe(170);
    expect(agr.widthIn).toBe(6.693);
    expect(journalWidthWithinTol(6.693, agr)).toBe(true);
    expect(journalWidthWithinTol(8, agr)).toBe(false);
  });

  it("builds export manifest with csv + qa summary", () => {
    const pack = resolveJournalPack("nature", 1);
    const manifest = buildChartExportManifest({
      baseName: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      chartType: "bar_grouped",
      caption: "产量",
      journal: pack,
      qa: {
        verdict: "repair",
        findings: [
          { code: "annotation_clipped", layer: "L2", action: "repair", message: "边距" },
          { code: "missing_unit", layer: "L0", action: "block", message: "缺单位" },
        ],
      },
      hasSvg: true,
      hasPdf: true,
      hasCsv: true,
      actualWidthIn: 3.5,
    });
    expect(manifest.files.png).toMatch(/\.png$/);
    expect(manifest.files.svg).toMatch(/\.svg$/);
    expect(manifest.files.csv).toMatch(/\.csv$/);
    expect(manifest.files.manifest).toMatch(/\.json$/);
    expect(manifest.qa.blockCodes).toEqual(["missing_unit"]);
    expect(manifest.qa.verdict).toBe("repair");
    expect(journalWidthWithinTol(manifest.actualWidthIn ?? 0, pack)).toBe(true);
  });
});

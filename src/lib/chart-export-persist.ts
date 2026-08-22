import fs from "fs";
import path from "path";
import type { ChartQaReport } from "@/contracts/chart-qa";
import type { ChartSpecV1 } from "@/contracts/chart-spec";
import {
  buildChartExportManifest,
  resolveJournalPack,
  type ChartExportManifest,
} from "@/contracts/chart-export";
import { getChartsDir } from "@/lib/charts-dir";

export function persistChartExportSidecars(input: {
  baseName: string;
  csvText?: string;
  spec?: ChartSpecV1;
  qa?: ChartQaReport;
  figWidth?: number;
  columns?: number;
  preset?: string;
}): ChartExportManifest {
  const chartsDir = getChartsDir();
  const hasSvg = fs.existsSync(path.join(chartsDir, `${input.baseName}.svg`));
  const hasPdf = fs.existsSync(path.join(chartsDir, `${input.baseName}.pdf`));
  const hasTiff =
    fs.existsSync(path.join(chartsDir, `${input.baseName}.tiff`))
    || fs.existsSync(path.join(chartsDir, `${input.baseName}.tif`));

  let hasCsv = false;
  const csvText = input.csvText?.trim();
  if (csvText) {
    fs.writeFileSync(path.join(chartsDir, `${input.baseName}.csv`), csvText, "utf-8");
    hasCsv = true;
  }

  const journal = resolveJournalPack(
    input.spec?.journal.preset ?? input.preset,
    input.spec?.journal.columns ?? input.columns,
    input.spec?.journal.exportFormats,
  );

  const manifest = buildChartExportManifest({
    baseName: input.baseName,
    chartType: input.spec?.chartType,
    caption: input.spec?.caption,
    claim: input.spec?.claim,
    journal,
    qa: input.qa,
    hasSvg,
    hasPdf,
    hasTiff,
    hasCsv,
    actualWidthIn: input.figWidth,
  });

  fs.writeFileSync(
    path.join(chartsDir, `${input.baseName}.json`),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  return manifest;
}

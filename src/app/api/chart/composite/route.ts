import { NextRequest, NextResponse } from "next/server";
import { runPanelGeneration } from "@/lib/agent/panel-runner";
import { validateBody } from "@/lib/api-validate";
import { AGENT_CHART_TYPES, isAgentChartType } from "@/lib/chart-runner";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";
import { compositeFigureSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/chart/composite — 把已有数据图拼成 a/b/c 组图并细调各格 */
export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse } = await validateBody(compositeFigureSchema, await req.json());
    if (errorResponse) return errorResponse;

    for (let i = 0; i < data.panels.length; i++) {
      const chartType = data.panels[i]!.chartType.trim();
      if (!isAgentChartType(chartType)) {
        return NextResponse.json(
          { error: `第 ${i + 1} 格图型无效。可用：${AGENT_CHART_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
    }

    const generated = await runPanelGeneration({
      title: data.title.trim(),
      preset: data.preset,
      cols: data.cols,
      panels: data.panels.map((panel) => ({
        chartType: panel.chartType.trim(),
        csv: panel.csv,
        title: panel.title?.trim() ?? "",
        xLabel: panel.xLabel?.trim() ?? "",
        yLabel: panel.yLabel?.trim() ?? "",
        yMin: panel.yMin,
        yMax: panel.yMax,
        showLegend: panel.showLegend,
        palette: panel.palette,
        span: panel.span,
      })),
    });

    return NextResponse.json({
      imageUrl: generated.imageUrl,
      fileName: generated.fileName,
      panelCount: generated.panelCount,
    });
  } catch (error: unknown) {
    logger.error("Composite chart failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "组图生成失败" },
      { status: 500 },
    );
  }
}

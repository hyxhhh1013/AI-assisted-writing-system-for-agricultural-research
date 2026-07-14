import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { parseOptionalJsonConfig } from "@/lib/api-validate";
import { chartModeSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";
import { runChartGeneration } from "@/lib/chart-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 调用 Python 脚本生成图表
 * POST /api/chart
 * Body: FormData { dataFile: File, config: string(JSON), mode: "generic" | "crd" }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const dataFile = formData.get("dataFile") as File | null;
    const configStr = formData.get("config") as string | null;
    const modeRaw = formData.get("mode");
    const modeResult = chartModeSchema.safeParse(
      typeof modeRaw === "string" && modeRaw ? modeRaw : "generic",
    );
    if (!modeResult.success) {
      return NextResponse.json({ error: "图表模式无效" }, { status: 400 });
    }
    const mode = modeResult.data;

    if (!dataFile) {
      return NextResponse.json({ error: "请上传数据文件" }, { status: 400 });
    }

    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    const buffer = Buffer.from(await dataFile.arrayBuffer());
    const generated = await runChartGeneration({
      dataBuffer: buffer,
      dataFileName: dataFile.name,
      config: config ?? {},
      mode,
    });

    const fs = await import("fs");
    const path = await import("path");
    const outputPath = path.join(process.cwd(), "data", "charts", generated.fileName);
    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: generated.imageUrl,
      svgUrl: generated.svgUrl,
      pdfUrl: generated.pdfUrl,
      fileName: generated.fileName,
      baseName: generated.baseName,
    });
  } catch (error: unknown) {
    logger.error("Chart API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "图表生成失败" },
      { status: 500 },
    );
  }
}

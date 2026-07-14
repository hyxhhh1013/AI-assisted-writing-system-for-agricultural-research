import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { analyzeFile } from "@/services/data-analysis";
import { getErrorMessage } from "@/lib/error-utils";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!getUserIdFromRequest(req)) return unauthorizedResponse();

  try {
    const contentType = req.headers.get("content-type") || "";

    let fileName = "data.csv";
    let buffer: ArrayBuffer | undefined;
    let text: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "未上传文件" }, { status: 400 });
      }
      fileName = file.name;
      buffer = await file.arrayBuffer();

      // Detect format and parse accordingly
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        // XLSX: pass ArrayBuffer directly
      } else {
        // CSV/TSV: convert to string
        text = new TextDecoder().decode(buffer);
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      text = body.data;
      fileName = body.fileName || "data.csv";
    } else {
      // Raw body
      text = await req.text();
    }

    if (!text && !buffer) {
      return NextResponse.json({ error: "无数据" }, { status: 400 });
    }

    const input = buffer ?? text!;
    const result = await analyzeFile(input, fileName);

    return NextResponse.json({
      analysis: result.analysis,
      claims: result.claims,
      chartConfigs: result.chartConfigs,
    });
  } catch (error: unknown) {
    logger.error("Data analyze error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "分析失败" }, { status: 500 });
  }
}

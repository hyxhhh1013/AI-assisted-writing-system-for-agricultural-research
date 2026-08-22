import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { renderProjectPdf } from "@/services/server-pdf";
import type { ProjectData } from "@/contracts/project";
import { getErrorMessage } from "@/lib/error-utils";
import { assessExportReadinessAsync } from "@/lib/export-readiness-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sanitizeFilename = (value: string): string =>
  (value || "paper")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "paper";

const isProjectData = (value: unknown): value is ProjectData => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectData>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.sections === "object" &&
    candidate.sections !== null
  );
};

/** 仅允许环境变量显式开启调试绕过，禁止公开 ?force=1 */
function allowExportGateBypass(): boolean {
  return process.env.EXPORT_FORCE_BYPASS === "1";
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isProjectData(body)) {
      return new Response("PDF 导出请求缺少有效论文数据", { status: 400 });
    }

    if (!allowExportGateBypass()) {
      const userId = req.headers.get("x-user-id") || undefined;
      const readiness = await assessExportReadinessAsync(body, {
        projectId: body.id,
        userId,
      });
      if (!readiness.ok) {
        return Response.json(
          {
            success: false,
            error: readiness.gate.hint,
            gate: readiness.gate,
            warnings: readiness.warnings,
            bibOnlyPrecise: readiness.bibOnlyPrecise,
            code: "CITATION_GATE_BLOCKED",
          },
          { status: 422 },
        );
      }
      // soft warnings 经客户端 /api/export/readiness 已 toast；此处不阻断 PDF 字节流
    }

    const pdf = await renderProjectPdf(body);
    const filename = `${sanitizeFilename(body.title)}.pdf`;
    const responseBody = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    ) as ArrayBuffer;

    return new Response(responseBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    logger.error("Server PDF Export Error:", error);
    const message = error instanceof Error ? getErrorMessage(error) : "未知错误";
    return new Response(`PDF 服务端导出失败: ${message}`, { status: 500 });
  }
}

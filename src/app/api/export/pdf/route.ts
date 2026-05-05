import { NextRequest } from "next/server";
import { renderProjectPdf } from "@/services/server-pdf";
import type { ProjectData } from "@/lib/store";

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

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!isProjectData(body)) {
      return new Response("PDF 导出请求缺少有效论文数据", { status: 400 });
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
    console.error("Server PDF Export Error:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    return new Response(`PDF 服务端导出失败: ${message}`, { status: 500 });
  }
}

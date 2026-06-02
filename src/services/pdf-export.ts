"use client";

import type { ProjectData } from "@/contracts/project";

export type PdfExportResponse = {
  filename: string;
};

const extractFilename = (contentDisposition: string | null, fallback: string): string => {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }

  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || fallback;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export async function exportProjectToPdf(project: ProjectData): Promise<PdfExportResponse> {
  const response = await fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || "PDF 服务端导出失败");
  }

  const fallback = `${project.title || "paper"}.pdf`;
  const filename = extractFilename(response.headers.get("Content-Disposition"), fallback);
  const blob = await response.blob();
  downloadBlob(blob, filename);

  return { filename };
}

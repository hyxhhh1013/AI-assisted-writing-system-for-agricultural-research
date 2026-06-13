import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { applyJournalMetricsFromUpload } from "@/lib/knowledge-metadata";

function isSpreadsheet(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "xlsx" || ext === "xls";
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "请上传 CSV 或 Excel 文件（字段名 file）" }, { status: 400 });
      }

      const payload = isSpreadsheet(file.name)
        ? await file.arrayBuffer()
        : await file.text();

      if ((typeof payload === "string" && !payload.trim()) || (payload instanceof ArrayBuffer && payload.byteLength === 0)) {
        return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
      }

      const result = await applyJournalMetricsFromUpload(payload, {
        dryRun,
        filename: file.name,
      });

      const rate = result.totalFiles > 0
        ? Math.round((result.matched / result.totalFiles) * 100)
        : 0;

      return NextResponse.json({
        ok: true,
        dryRun,
        ...result,
        matchRate: rate,
        message: dryRun
          ? `试运行：表内 ${result.lookupIssn} ISSN + ${result.lookupJournal} 刊名；${result.totalFiles} 篇文献预计命中 ${result.matched} 篇（${rate}%）`
          : `已更新 ${result.updated} 篇（匹配 ${result.matched}/${result.totalFiles}，跳过 ${result.skipped}）`,
      });
    }

    const csvText = await req.text();
    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
    }

    const result = await applyJournalMetricsFromUpload(csvText, { dryRun, filename: "upload.csv" });
    const rate = result.totalFiles > 0
      ? Math.round((result.matched / result.totalFiles) * 100)
      : 0;

    return NextResponse.json({
      ok: true,
      dryRun,
      ...result,
      matchRate: rate,
      message: dryRun
        ? `试运行：表内 ${result.lookupIssn} ISSN + ${result.lookupJournal} 刊名；预计命中 ${result.matched} 篇（${rate}%）`
        : `已更新 ${result.updated} 篇文献指标`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

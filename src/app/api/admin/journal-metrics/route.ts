import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { applyJournalMetricsFromCsv } from "@/lib/knowledge-metadata";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const contentType = req.headers.get("content-type") ?? "";
  let csvText = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 CSV 文件（字段名 file）" }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    csvText = await req.text();
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const result = await applyJournalMetricsFromCsv(csvText, { dryRun });
    return NextResponse.json({
      ok: true,
      dryRun,
      ...result,
      message: dryRun
        ? `试运行：${result.lookupSize} 条 ISSN 映射，将更新 ${result.matched} 篇`
        : `已更新 ${result.updated} 篇文献指标（匹配 ${result.matched}，跳过 ${result.skipped}）`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

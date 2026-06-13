import { getErrorMessage } from "@/lib/error-utils";
import { commitBibliographyImport, previewBibliographyImport } from "@/lib/bibliography-import";
import { validateBody } from "@/lib/api-validate";
import { bibliographyImportCommitSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** POST multipart：预览书目导入（dryRun=true）；POST JSON：确认写入 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { data, errorResponse } = await validateBody(bibliographyImportCommitSchema, body);
      if (errorResponse) return errorResponse;

      const result = await commitBibliographyImport(data.items, data.category);
      return NextResponse.json({
        message: `导入完成：新建 ${result.created}，合并 ${result.updated}，跳过 ${result.skipped}`,
        ...result,
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 .ris 或 .bib 文件" }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "文件过大（上限 5MB）" }, { status: 400 });
    }

    const categoryRaw = formData.get("category");
    const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : "未分类";
    const dryRun = formData.get("dryRun") !== "false";

    const content = await file.text();
    if (!content.trim()) {
      return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
    }

    const preview = await previewBibliographyImport(file.name, content, category);
    if (preview.totalParsed === 0) {
      return NextResponse.json({ error: "未解析到有效书目条目" }, { status: 400 });
    }

    if (!dryRun) {
      const items = preview.rows
        .filter((row) => row.action !== "skip")
        .map((row) => ({
          tempId: row.tempId,
          action: row.action,
          bib: row.bib,
          documentType: row.documentType,
          suggestedName: row.suggestedName,
          targetName: row.action === "merge" ? (row.pdfMatchName || row.duplicateName || row.suggestedName) : undefined,
        }));
      const result = await commitBibliographyImport(items, category);
      return NextResponse.json({
        message: `导入完成：新建 ${result.created}，合并 ${result.updated}，跳过 ${result.skipped}`,
        ...result,
        preview,
      });
    }

    return NextResponse.json({
      format: preview.format,
      category,
      rows: preview.rows,
      totalParsed: preview.totalParsed,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || "书目导入失败" }, { status: 500 });
  }
}

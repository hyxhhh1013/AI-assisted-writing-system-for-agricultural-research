import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseDataSources } from "@/contracts/project";
import { readAttachmentFile } from "@/lib/agent/attachments/storage";
import { loadTabularGrids } from "@/lib/data-block-inventory";
import { originalTabularName, previewFromGrids } from "@/lib/data-table-snapshot";

const TABULAR = new Set(["csv", "tsv", "xlsx", "xls", "dpt", "xy"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** GET /api/projects/:id/data-preview?fileName= — 点开已入库的一块时，从原附件读出前若干行 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const fileName = new URL(req.url).searchParams.get("fileName")?.trim() ?? "";
    if (!fileName || fileName.length > 180) {
      return NextResponse.json({ error: "缺少文件名" }, { status: 400 });
    }

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { dataSources: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    const source = parseDataSources({ dataSources: owned.dataSources ?? undefined })
      .find((item) => item.fileName === fileName);
    if (!source) return NextResponse.json({ found: false });

    const original = originalTabularName(fileName);
    if (!TABULAR.has(extOf(original))) return NextResponse.json({ found: false });

    const attachments = await prisma.agentAttachment.findMany({
      where: { userId, originalName: original },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, projectId: true },
    });
    const attachment = attachments.find((item) => item.projectId === projectId) ?? attachments[0];
    if (!attachment) return NextResponse.json({ found: false });

    let grids;
    try {
      const buf = readAttachmentFile(userId, attachment.id);
      const copy = new ArrayBuffer(buf.byteLength);
      new Uint8Array(copy).set(buf);
      grids = await loadTabularGrids(copy, original);
    } catch {
      return NextResponse.json({ found: false });
    }

    const snapshot = previewFromGrids(
      grids,
      fileName,
      source.columns.map((column) => column.name),
    );
    if (!snapshot) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, snapshot });
  } catch (error) {
    logger.error("Data preview GET error:", error);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

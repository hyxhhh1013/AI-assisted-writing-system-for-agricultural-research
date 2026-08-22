import { NextRequest, NextResponse } from "next/server";
import type { ProjectData } from "@/contracts/project";
import { assessExportReadinessAsync } from "@/lib/export-readiness-server";
import { getErrorMessage } from "@/lib/error-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProjectData = (value: unknown): value is ProjectData => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectData>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.sections === "object" &&
    candidate.sections !== null
  );
};

/**
 * POST /api/export/readiness
 * 导出前就绪检查（引用硬检 + bib_only 精确数据软告警）。
 * 软告警不阻断 ok；硬检未过则 ok=false。
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body: unknown = await req.json();
    if (!isProjectData(body)) {
      return NextResponse.json({ error: "缺少有效论文数据" }, { status: 400 });
    }

    const readiness = await assessExportReadinessAsync(body, {
      projectId: body.id,
      userId,
    });

    return NextResponse.json({
      success: true,
      ok: readiness.ok,
      gate: readiness.gate,
      warnings: readiness.warnings,
      bibOnlyPrecise: readiness.bibOnlyPrecise,
      counterpartAbstract: readiness.counterpartAbstract,
      chartAssetCount: readiness.chartAssets.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

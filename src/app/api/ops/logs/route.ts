import { NextRequest, NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";
import { clampQueryInt, opsJson } from "@/lib/ops-http";
import { opsLogPaths, parseOpsLogSource, readOpsLogTail } from "@/lib/ops-logs";

export const dynamic = "force-dynamic";

/** GET /api/ops/logs — 固定日志文件的尾部。不接受任意路径。 */
export async function GET(req: NextRequest) {
  const denied = requireOps(req);
  if (denied) return denied;

  const source = parseOpsLogSource(new URL(req.url).searchParams.get("source"));
  if (!source) {
    return NextResponse.json(
      { success: false, error: "source 只能是 app、deploy 或 reindex" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const lines = clampQueryInt(new URL(req.url).searchParams.get("lines"), 80, 200);
  try {
    const parts = await Promise.all(opsLogPaths(source).map(async (file) => ({
      file: file.startsWith(process.cwd()) ? file.slice(process.cwd().length) : file,
      lines: await readOpsLogTail(file, lines),
    })));
    return opsJson({ source, parts });
  } catch {
    return NextResponse.json(
      { success: false, error: "运维查询失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

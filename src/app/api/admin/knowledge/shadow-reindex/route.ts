import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success, badRequest } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { shadowReindexRefusal } from "@/lib/shadow-reindex-job";
import {
  pidIsAlive,
  readShadowJobPid,
  readShadowPreview,
  readShadowView,
  writeShadowJobPid,
} from "@/lib/shadow-reindex-status";
import { adminShadowReindexSchema, adminShadowStatusQuerySchema } from "@/lib/validations";
import { listPdfFiles, selectShadowFiles } from "../../../../../../scripts/lib/shadow-index.mjs";

export const runtime = "nodejs";

let activeChild: ReturnType<typeof spawn> | null = null;

function articlesDir() {
  return path.resolve(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");
}

/**
 * GET /api/admin/knowledge/shadow-reindex?category=&file=
 * 进度与单篇抽查。不读线上索引。
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = adminShadowStatusQuerySchema.safeParse(params);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "参数不正确");
  }

  const shadowDir = path.join(process.cwd(), "data", "shadow");
  try {
    if (parsed.data.file) {
      return success(readShadowPreview(shadowDir, parsed.data.category, parsed.data.file));
    }
    const pid = readShadowJobPid(shadowDir);
    return success(readShadowView(shadowDir, parsed.data.category, pid !== null && pidIsAlive(pid)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "读不到影子";
    return badRequest(message);
  }
}

/**
 * POST /api/admin/knowledge/shadow-reindex
 * 一次一个分类，只写 data/shadow。不改线上索引。
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { data, errorResponse } = await validateBody(adminShadowReindexSchema, body);
  if (errorResponse) return errorResponse;

  let fileCount = 0;
  try {
    fileCount = selectShadowFiles(listPdfFiles(articlesDir()), { category: data.category }).length;
  } catch (err) {
    const message = err instanceof Error ? err.message : "无法选择分类";
    return badRequest(message);
  }

  const refusal = shadowReindexRefusal({
    category: data.category,
    fileCount,
    alreadyRunning: activeChild !== null && activeChild.exitCode === null,
  });
  if (refusal) {
    return NextResponse.json({ success: false, error: refusal.error }, { status: refusal.status });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "shadow-reading-order.mjs");
  const args = [scriptPath, `--category=${data.category}`];
  if (data.resume) args.push("--resume");
  const shadowDir = path.join(process.cwd(), "data", "shadow");
  fs.mkdirSync(shadowDir, { recursive: true });
  const logFd = fs.openSync(path.join(shadowDir, "rebuild.log"), "a");
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  activeChild = child;
  if (typeof child.pid === "number") {
    writeShadowJobPid(shadowDir, child.pid, data.category, fileCount);
  }
  child.once("error", () => {
    if (activeChild === child) activeChild = null;
  });
  child.once("exit", () => {
    if (activeChild === child) activeChild = null;
    fs.closeSync(logFd);
  });
  child.unref();

  return success(
    { category: data.category, fileCount, resume: data.resume === true },
    `已开始影子重建「${data.category}」，${fileCount} 篇。线上索引未改。`,
  );
}

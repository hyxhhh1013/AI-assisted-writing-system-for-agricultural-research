import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success, badRequest } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { shadowReindexRefusal } from "@/lib/shadow-reindex-job";
import { adminShadowReindexSchema } from "@/lib/validations";
import { listPdfFiles, selectShadowFiles } from "../../../../../../scripts/lib/shadow-index.mjs";

export const runtime = "nodejs";

let activeChild: ReturnType<typeof spawn> | null = null;

function articlesDir() {
  return path.resolve(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");
}

/**
 * POST /api/admin/knowledge/shadow-reindex
 * 深夜、一次一个分类，只写 data/shadow。不改线上索引。
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

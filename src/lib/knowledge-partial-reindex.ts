/**
 * 对指定知识库 PDF 跑增量 index-pdfs（默认跳过 embedding，缩短导入等待）
 */

import { spawn } from "child_process";
import path from "path";
import { createLogger } from "@/lib/logger";

const log = createLogger("knowledge-partial-reindex");

export interface PartialReindexResult {
  ok: boolean;
  code: number | null;
  stderr: string;
}

export function runPartialPdfIndex(
  fileNames: string[],
  opts?: { skipEmbed?: boolean; timeoutMs?: number },
): Promise<PartialReindexResult> {
  const names = [...new Set(fileNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) {
    return Promise.resolve({ ok: true, code: 0, stderr: "" });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "index-pdfs.mjs");
  const args = [
    scriptPath,
    `--files=${names.map((n) => encodeURIComponent(n)).join(",")}`,
  ];
  if (opts?.skipEmbed !== false) args.push("--skip-stage3");

  const timeoutMs = opts?.timeoutMs ?? 180_000;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      log.warn("partial reindex timeout", { files: names.length });
      resolve({ ok: false, code: null, stderr: stderr.slice(-2000) || "timeout" });
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.fail("partial reindex spawn error", err);
      resolve({ ok: false, code: null, stderr: err.message });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stderr: stderr.slice(-2000),
      });
    });
  });
}

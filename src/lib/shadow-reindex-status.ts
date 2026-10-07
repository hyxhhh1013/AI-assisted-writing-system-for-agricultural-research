import fs from "fs";
import path from "path";
import type {
  ShadowDocumentPreview,
  ShadowRebuildJob,
  ShadowRebuildView,
  ShadowTextSample,
} from "@/contracts/shadow-reindex";
import { shadowChunkPath } from "../../scripts/lib/shadow-index.mjs";

const SAMPLE_CHARS = 280;
const SAMPLE_COUNT = 4;
const FILE_LIST_LIMIT = 40;

export function readShadowJob(shadowRoot: string): ShadowRebuildJob | null {
  const file = path.join(shadowRoot, "progress.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ShadowRebuildJob>;
    if (!raw.category || typeof raw.fileCount !== "number") return null;
    return {
      category: raw.category,
      fileCount: raw.fileCount,
      written: typeof raw.written === "number" ? raw.written : 0,
      lastFile: typeof raw.lastFile === "string" ? raw.lastFile : null,
      finished: raw.finished === true,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function listShadowFileNames(shadowRoot: string, category: string): string[] {
  shadowChunkPath(shadowRoot, category, "probe.pdf");
  const dir = path.join(shadowRoot, "chunks", category);
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  names.sort((a, b) => {
    const aTime = fs.statSync(path.join(dir, a)).mtimeMs;
    const bTime = fs.statSync(path.join(dir, b)).mtimeMs;
    return bTime - aTime;
  });
  return names.slice(0, FILE_LIST_LIMIT).map((name) => name.slice(0, -".json".length));
}

export function readShadowView(
  shadowRoot: string,
  category: string,
  pidAlive: boolean,
): ShadowRebuildView {
  const job = readShadowJob(shadowRoot);
  const running = pidAlive && job !== null && !job.finished;
  const sameJob = job?.category === category;
  return {
    category,
    running: running && sameJob,
    activeCategory: running ? job.category : null,
    fileCount: sameJob ? job.fileCount : 0,
    written: sameJob ? job.written : 0,
    lastFile: sameJob ? job.lastFile : null,
    finished: sameJob && job.finished && !running,
    files: listShadowFileNames(shadowRoot, category),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function summarizeShadowDocument(raw: unknown): ShadowDocumentPreview {
  const doc = asRecord(raw);
  const chunks = Array.isArray(doc?.chunks) ? doc.chunks : [];
  let keptOldChunks = 0;
  const fresh: ShadowTextSample[] = [];
  const old: ShadowTextSample[] = [];
  for (const item of chunks) {
    const chunk = asRecord(item);
    const meta = asRecord(chunk?.metadata);
    const keptOld = meta?.keptOld === true;
    if (keptOld) keptOldChunks += 1;
    const text = typeof chunk?.content === "string" ? chunk.content.trim() : "";
    if (!text) continue;
    const sample: ShadowTextSample = {
      page: typeof meta?.pageStart === "number" ? meta.pageStart : 0,
      keptOld,
      text: text.slice(0, SAMPLE_CHARS),
    };
    if (keptOld) {
      if (old.length < 1) old.push(sample);
    } else if (fresh.length < SAMPLE_COUNT) {
      fresh.push(sample);
    }
  }
  const samples = [...fresh, ...old].slice(0, SAMPLE_COUNT);
  const pages = Array.isArray(doc?.crossColumnPages)
    ? doc.crossColumnPages.filter((page): page is number => typeof page === "number")
    : [];
  return {
    source: typeof doc?.source === "string" ? doc.source : "",
    category: typeof doc?.category === "string" ? doc.category : "",
    builtAt: typeof doc?.builtAt === "string" ? doc.builtAt : "",
    chunkCount: chunks.length,
    keptOldChunks,
    crossColumnPages: pages,
    samples,
  };
}

export function readShadowPreview(shadowRoot: string, category: string, filename: string): ShadowDocumentPreview {
  const target = shadowChunkPath(shadowRoot, category, filename);
  if (!fs.existsSync(target)) {
    throw new Error("还没有这篇的影子");
  }
  return summarizeShadowDocument(JSON.parse(fs.readFileSync(target, "utf8")));
}

export function shadowJobPidPath(shadowRoot: string): string {
  return path.join(shadowRoot, "job.json");
}

export function readShadowJobPid(shadowRoot: string): number | null {
  const file = shadowJobPidPath(shadowRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { pid?: unknown };
    return typeof raw.pid === "number" ? raw.pid : null;
  } catch {
    return null;
  }
}

export function writeShadowJobPid(shadowRoot: string, pid: number, category: string, fileCount: number): void {
  fs.mkdirSync(shadowRoot, { recursive: true });
  fs.writeFileSync(shadowJobPidPath(shadowRoot), JSON.stringify({
    pid,
    category,
    fileCount,
    startedAt: new Date().toISOString(),
  }));
}

export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

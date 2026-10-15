import fs from "fs";
import os from "os";
import path from "path";

export type OpsLogSource = "app" | "deploy" | "reindex";

export function parseOpsLogSource(raw: string | null): OpsLogSource | null {
  if (raw === "app" || raw === "deploy" || raw === "reindex") return raw;
  return null;
}

export function redactOpsLogLine(line: string): string {
  return line
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[redacted]@")
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "[redacted]")
    .replace(/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*)=(\S+)/gi, "$1=[redacted]");
}

export function tailText(text: string, lines: number): string[] {
  return text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0).slice(-lines);
}

export function opsLogPaths(source: OpsLogSource): string[] {
  if (source === "deploy") return ["/tmp/grainscript-deploy.log"];
  if (source === "reindex") return [path.join(process.cwd(), "data", "ops-reindex.log")];
  const home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
  return [
    path.join(home, "logs", "grainscript-out.log"),
    path.join(home, "logs", "grainscript-error.log"),
  ];
}

export async function readOpsLogTail(file: string, lines: number): Promise<string[]> {
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile() || stat.size <= 0) return [];
    const length = Math.min(stat.size, 256 * 1024);
    const handle = await fs.promises.open(file, "r");
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, stat.size - length);
      return tailText(buffer.toString("utf8"), lines).map(redactOpsLogLine);
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

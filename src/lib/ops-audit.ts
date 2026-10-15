import fs from "fs";
import path from "path";

export async function appendOpsAudit(entry: {
  action: string;
  ok: boolean;
  target?: string;
  detail?: string;
}): Promise<void> {
  try {
    const dir = path.join(process.cwd(), "data");
    await fs.promises.mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      action: entry.action,
      ok: entry.ok,
      ...(entry.target ? { target: entry.target.slice(0, 120) } : {}),
      ...(entry.detail ? { detail: entry.detail.slice(0, 400) } : {}),
    });
    await fs.promises.appendFile(path.join(dir, "ops-audit.jsonl"), `${line}\n`);
  } catch {
    /* 留痕失败不挡住运维动作 */
  }
}

import { spawn } from "child_process";

export class ChildTimeoutError extends Error {
  readonly timedOut = true;
  constructor(timeoutMs: number) {
    super(`子进程超时（${timeoutMs}ms）`);
    this.name = "ChildTimeoutError";
  }
}

export interface ChildRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * 跑一个子进程，超时后杀掉。stdout/stderr 有上限，避免挂起的进程把内存撑满。
 * 调用方负责删自己的临时目录。
 */
export function runCommand(
  command: string,
  args: string[],
  opts?: {
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    maxBuffer?: number;
  },
): Promise<ChildRunResult> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 2_000_000;
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: false,
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      proc.kill();
      finish(() => reject(new ChildTimeoutError(timeoutMs)));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      finish(() => reject(err));
    });
    proc.on("close", (code) => {
      finish(() => resolve({ code, stdout, stderr }));
    });
  });
}

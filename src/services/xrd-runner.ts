/** XRD/Python 脚本执行器 — 全项目统一的 Python 调用入口 */

import { execFile } from "child_process";
import { promisify } from "util";
import { PYTHON_CMD } from "@/lib/python-cmd";

const execFileAsync = promisify(execFile);

export interface XrdResult {
  stdout: string;
  stderr: string;
}

/**
 * 执行 Python 脚本
 * @param scriptName 脚本文件名（位于 scripts/charts/ 或 scripts/xrd/ 目录）
 * @param args 命令行参数
 * @param cwd 工作目录（默认项目根目录）
 */
export async function runPythonScript(
  scriptName: string,
  args: string[] = [],
  cwd: string = process.cwd(),
): Promise<XrdResult> {
  const { stdout, stderr } = await execFileAsync(PYTHON_CMD, [scriptName, ...args], {
    cwd,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });
  return { stdout, stderr };
}

export { PYTHON_CMD };

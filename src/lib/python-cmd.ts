/** 子进程调用 Python 的统一入口（图表 / XRD / 表格等） */

function defaultPythonCmd(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * 解析可用的 Python 可执行文件名。
 * Linux 上常见误配：`.env` 写 `PYTHON_CMD=python` 但系统只有 `python3`。
 */
export function resolvePythonCmd(): string {
  const fromEnv = process.env.PYTHON_CMD?.trim();
  if (!fromEnv) return defaultPythonCmd();
  if (process.platform !== "win32" && fromEnv === "python") {
    return "python3";
  }
  return fromEnv;
}

export const PYTHON_CMD = resolvePythonCmd();

export function formatPythonSpawnError(raw: string): string {
  if (/ENOENT/i.test(raw) && /python/i.test(raw)) {
    return `找不到 Python 解释器（当前 PYTHON_CMD=${PYTHON_CMD}）。请在服务器安装 python3 与 matplotlib，并在 .env 设置 PYTHON_CMD=python3`;
  }
  return raw;
}

/** Python 子进程 stdout JSON 的通用形状（各 XRD 脚本略有差异） */
export interface XrdPythonJsonResult {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

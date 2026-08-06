/** XRD / 仪器数据扩展名（上传落盘用） */

const XRD_EXT = [
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".txt",
  ".xy",
  ".xyd",
  ".ras",
  ".raw",
  ".uxd",
  ".dif",
] as const;

export const XRD_FILE_ACCEPT =
  ".csv,.txt,.tsv,.xy,.xyd,.ras,.raw,.uxd,.dif,.xlsx,.xls";

export function resolveXrdUploadExt(filename: string): string {
  const lower = filename.toLowerCase();
  for (const ext of XRD_EXT) {
    if (lower.endsWith(ext)) return ext;
  }
  return ".csv";
}

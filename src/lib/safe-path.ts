import path from "path";

/** 知识库/PDF 等用户可控路径片段的校验与 base 目录内 resolve */

export class SafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafePathError";
  }
}

/** 单段路径名（文件名或分类目录名），禁止分隔符与 `..` */
export function assertSafePathSegment(segment: string, label: string): void {
  if (!segment || segment !== segment.trim()) {
    throw new SafePathError(`${label} 无效`);
  }
  if (segment.includes("\0")) {
    throw new SafePathError(`${label} 无效`);
  }
  if (segment.includes("..")) {
    throw new SafePathError(`${label} 无效`);
  }
  if (segment.includes("/") || segment.includes("\\")) {
    throw new SafePathError(`${label} 无效`);
  }
}

/** 将分类转为存储用目录段；「未分类」落在 base 根目录 */
export function categoryToDirSegment(category: string): string {
  assertSafePathSegment(category, "分类");
  return category === "未分类" ? "" : category;
}

/** 在 baseDir 下安全拼接路径，越界则抛 SafePathError */
export function resolveInsideBaseDir(baseDir: string, ...segments: string[]): string {
  for (const seg of segments) {
    if (seg) assertSafePathSegment(seg, "路径段");
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...segments.filter(Boolean));
  assertResolvedInsideBase(base, resolved);
  return resolved;
}

/** 已存在的绝对路径必须在 baseDir 内 */
export function assertResolvedInsideBase(baseDir: string, targetPath: string): void {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(targetPath);
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SafePathError("路径越界");
  }
}

/** 知识库：分类 + 文件名 → papers 目录内绝对路径 */
export function resolveKnowledgeFilePath(
  articlesDir: string,
  category: string,
  fileName: string,
): string {
  const dirSeg = categoryToDirSegment(category);
  return dirSeg
    ? resolveInsideBaseDir(articlesDir, dirSeg, fileName)
    : resolveInsideBaseDir(articlesDir, fileName);
}

/** 知识库：分类对应目录（「未分类」为 articles 根） */
export function resolveKnowledgeCategoryDir(articlesDir: string, category: string): string {
  const dirSeg = categoryToDirSegment(category);
  return dirSeg ? resolveInsideBaseDir(articlesDir, dirSeg) : resolveInsideBaseDir(articlesDir);
}

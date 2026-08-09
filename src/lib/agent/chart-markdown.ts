/**
 * 章节正文中 Markdown 图片的增删改（Agent 配图）。
 * 纯函数，便于单测；不碰数据库。
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去掉指向 imageUrl 的全部 ![alt](url) */
export function stripMarkdownImagesByUrl(
  content: string,
  imageUrl: string,
): { next: string; removed: number } {
  const url = imageUrl.trim();
  if (!url || !content) return { next: content, removed: 0 };
  const re = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`, "g");
  let removed = 0;
  let next = content.replace(re, () => {
    removed += 1;
    return "";
  });
  if (removed > 0) {
    next = next.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  return { next, removed };
}

/**
 * 把正文中指向 oldUrl 的图片就地换成 newUrl（保留位置，避免「新图堆在旧图下面」）。
 * 若正文没有旧图，replaced=0，调用方应改为 append。
 */
export function replaceMarkdownImageUrl(
  content: string,
  oldUrl: string,
  newUrl: string,
  newCaption?: string,
): { next: string; replaced: number } {
  const from = oldUrl.trim();
  const to = newUrl.trim();
  if (!from || !to || !content) return { next: content, replaced: 0 };
  const re = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(from)}\\)`, "g");
  let replaced = 0;
  const next = content.replace(re, (_m, alt: string) => {
    replaced += 1;
    const caption = (newCaption?.trim() || alt || "").trim();
    return `![${caption}](${to})`;
  });
  return { next, replaced };
}

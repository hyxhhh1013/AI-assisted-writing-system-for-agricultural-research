/**
 * 正文 Markdown 插图顺序调整（节末落盘后的人工挪位）。
 * 与 editor-image-gallery 的匹配规则保持一致。
 */

export const MD_IMAGE_RE = String.raw`!\[([^\]]*)\]\(((?:data:image\/[^;]+;base64,[^)]+)|(?:(?:https?:\/\/|\/)[^)\s]*\.(?:png|jpe?g|svg|gif|webp|tiff?)(?:\?[^)]*)?))\)`;

export type MdImageHit = {
  index: number;
  markdown: string;
  alt: string;
  src: string;
  /** 含前后紧邻空行时的切除范围，便于干净挪动 */
  blockStart: number;
  blockEnd: number;
};

export function listMarkdownImages(content: string): MdImageHit[] {
  const re = new RegExp(MD_IMAGE_RE, "gi");
  const hits: MdImageHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    let blockStart = start;
    let blockEnd = end;
    // 吃掉图片块前后多余换行，移动时不留大洞
    while (blockStart > 0 && content[blockStart - 1] === "\n") {
      if (blockStart >= 2 && content[blockStart - 2] === "\n") {
        blockStart -= 1;
        break;
      }
      blockStart -= 1;
      if (start - blockStart > 2) break;
    }
    while (blockEnd < content.length && content[blockEnd] === "\n") {
      blockEnd += 1;
      if (blockEnd - end >= 2) break;
    }
    hits.push({
      index: hits.length,
      markdown: m[0],
      alt: m[1] || "image",
      src: m[2] || "",
      blockStart,
      blockEnd,
    });
  }
  return hits;
}

function extractBlock(content: string, hit: MdImageHit): string {
  return content.slice(hit.blockStart, hit.blockEnd);
}

/** 交换相邻两张图的位置（dir=-1 上移，+1 下移） */
export function moveMarkdownImage(
  content: string,
  imageIndex: number,
  dir: -1 | 1,
): string {
  const hits = listMarkdownImages(content);
  const j = imageIndex + dir;
  if (imageIndex < 0 || imageIndex >= hits.length || j < 0 || j >= hits.length) {
    return content;
  }
  const i0 = Math.min(imageIndex, j);
  const i1 = Math.max(imageIndex, j);
  const h0 = hits[i0]!;
  const h1 = hits[i1]!;
  const t0 = extractBlock(content, h0);
  const t1 = extractBlock(content, h1);
  return (
    content.slice(0, h0.blockStart)
    + t1
    + content.slice(h0.blockEnd, h1.blockStart)
    + t0
    + content.slice(h1.blockEnd)
  );
}

/** 将指定图移到文末（节末策略的显式操作） */
export function moveMarkdownImageToEnd(content: string, imageIndex: number): string {
  const hits = listMarkdownImages(content);
  const hit = hits[imageIndex];
  if (!hit) return content;
  const block = extractBlock(content, hit).replace(/^\n+|\n+$/g, "");
  const next = content.slice(0, hit.blockStart) + content.slice(hit.blockEnd);
  const base = next.replace(/\s+$/g, "");
  return `${base}\n\n${block}\n`;
}

/** 将指定图移到文首（标题后）：插在第一个非空行之后或开头 */
export function moveMarkdownImageToStart(content: string, imageIndex: number): string {
  const hits = listMarkdownImages(content);
  const hit = hits[imageIndex];
  if (!hit) return content;
  const block = extractBlock(content, hit).replace(/^\n+|\n+$/g, "");
  const next = content.slice(0, hit.blockStart) + content.slice(hit.blockEnd);
  // 若文首是 # 标题，插在首个标题行后
  const heading = /^(#{1,6}[^\n]*\n+)/.exec(next);
  if (heading) {
    return `${heading[1]}\n${block}\n${next.slice(heading[0].length)}`;
  }
  return `${block}\n\n${next.replace(/^\n+/, "")}`;
}

/** 将图插入到光标处（textarea selectionStart） */
export function moveMarkdownImageToCursor(
  content: string,
  imageIndex: number,
  cursor: number,
): string {
  const hits = listMarkdownImages(content);
  const hit = hits[imageIndex];
  if (!hit) return content;
  const block = `\n\n${extractBlock(content, hit).replace(/^\n+|\n+$/g, "")}\n\n`;
  // 若光标落在将要删除的块内，先删再按原光标前文本长度插入
  const before = content.slice(0, hit.blockStart);
  const after = content.slice(hit.blockEnd);
  const stripped = before + after;
  let pos = cursor;
  if (cursor >= hit.blockEnd) {
    pos = cursor - (hit.blockEnd - hit.blockStart);
  } else if (cursor > hit.blockStart) {
    pos = hit.blockStart;
  }
  pos = Math.max(0, Math.min(pos, stripped.length));
  return stripped.slice(0, pos) + block + stripped.slice(pos);
}

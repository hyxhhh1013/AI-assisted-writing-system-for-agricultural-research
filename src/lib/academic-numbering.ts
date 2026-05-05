/**
 * 论文章节 → 国标式一级章序号（用于 1.1.1 三级编号的首段）
 */
export function majorNumberFromSectionId(sectionId: string): number | null {
  switch (sectionId) {
    case "introduction":
      return 1;
    case "methods":
      return 2;
    case "results":
      return 3;
    case "conclusion":
      return 4;
    default:
      return null;
  }
}

/**
 * 去掉行首已有数字编号（避免与自动编号叠床架屋）
 */
export function stripLeadingEnumeration(line: string): string {
  return line
    .replace(
      /^\s*(?:(?:\(\s*)?\d+(?:\.\d+)*(?:\s*\))?|[一二三四五六七八九十]+[、．.])\s*/,
      "",
    )
    .trim();
}

/**
 * 在 text 中查找「行首」出现的 major.x.y 的最大 (x,y)（同一 major）
 */
export function maxThirdLevelInText(
  text: string,
  major: number,
): { sub: number; ter: number } {
  let maxSub = 1;
  let maxTer = 0;
  let any = false;
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d+)\.(\d+)\.(\d+)\b/);
    if (!m) continue;
    const ma = Number(m[1]);
    const su = Number(m[2]);
    const te = Number(m[3]);
    if (ma !== major) continue;
    any = true;
    if (su > maxSub || (su === maxSub && te > maxTer)) {
      maxSub = su;
      maxTer = te;
    }
  }
  if (!any) return { sub: 1, ter: 0 };
  return { sub: maxSub, ter: maxTer };
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将扩写得到的正文拆段，并在有 major 时为每段加上「major.sub.ter」行首编号（ter 递增）。
 */
export function buildNumberedParagraphBlocks(
  expanded: string,
  sectionId: string,
  textBeforeInsert: string,
): string {
  const major = majorNumberFromSectionId(sectionId);
  const rawParts = expanded
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawParts.length === 0) return "";

  if (major == null) {
    return rawParts.map((p) => `<p>${escapeHtmlText(p)}</p>`).join("");
  }

  let { sub, ter } = maxThirdLevelInText(textBeforeInsert, major);

  return rawParts
    .map((p) => {
      const lines = p.split("\n");
      if (lines.length > 0) lines[0] = stripLeadingEnumeration(lines[0]);
      const body = lines.join("\n").trim();
      if (!body) return "";
      ter += 1;
      const label = `${major}.${sub}.${ter}`;
      return `<p><strong>${label}</strong> ${escapeHtmlText(body)}</p>`;
    })
    .filter(Boolean)
    .join("");
}

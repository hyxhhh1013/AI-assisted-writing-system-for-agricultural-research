import { IMRAD_SECTION_NUMBER, SectionKey } from "@/lib/imrad";

/**
 * 论文章节 → 国标式一级章序号（用于 1.1.1 三级编号的首段）
 */
export function majorNumberFromSectionId(sectionId: string): number | null {
  const num = IMRAD_SECTION_NUMBER[sectionId as SectionKey];
  return num != null && num > 0 ? num : null;
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
 * 去掉行首 Markdown 标题标记（###、#### 等）
 */
function stripMarkdownHeadings(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").trim();
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

/**
 * 在 text 中查找 major.x 的最大 x（同一 major）
 */
export function maxSecondLevelInText(
  text: string,
  major: number,
): number {
  let maxSub = 0;
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d+)\.(\d+)\b/);
    if (!m) continue;
    if (Number(m[1]) === major) {
      maxSub = Math.max(maxSub, Number(m[2]));
    }
  }
  return maxSub;
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
 * 输出 HTML 格式（用于富文本编辑器）。
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

/**
 * 纯文本版本段落编号后处理。
 *
 * 处理顺序：
 * 1. 去掉所有 Markdown 标题标记（###、#### 等）
 * 2. 检查是否已有层级编号（如 "3.1 xxx"、"3.1.1 xxx"）→ 有则直接返回
 * 3. 否则按层级自动编号：二级标题 → major.sub，三级标题 → major.sub.ter
 */
/** 判断一行是否像编号标题（如 "2.1 标题" 或 "### 2.1 标题"）且无正文内容 */
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Markdown heading
  if (/^#{1,6}\s/.test(t)) return true;
  // 纯文本编号标题（2.1 / 2.1.1）
  if (/^\d+\.\d+(?:\.\d+)?\s+\S/.test(t)) return true;
  return false;
}

/** 去掉正文末尾连续出现的目录式标题行（≥2 行纯标题，无正文间隔） */
function stripTrailingTOC(content: string): string {
  const lines = content.split("\n");
  // 从末尾向前找连续的非空行
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  if (end < 0) return content;

  // 从末尾向前，收集连续的标题行
  let headingCount = 0;
  let idx = end;
  while (idx >= 0 && isHeadingLine(lines[idx])) {
    headingCount++;
    idx--;
    // 跳过标题行之间的空行
    while (idx >= 0 && lines[idx].trim() === "") idx--;
  }

  // ≥ 2 个连续标题在末尾 → 判定为目录，删除
  if (headingCount >= 2) {
    // 找到最后一个标题行之前的内容截止点
    let cutIdx = end;
    for (let i = 0; i < headingCount; i++) {
      while (cutIdx >= 0 && lines[cutIdx].trim() === "") cutIdx--;
      while (cutIdx >= 0 && isHeadingLine(lines[cutIdx])) cutIdx--;
    }
    // 删除之后的所有空行
    while (cutIdx >= 0 && lines[cutIdx].trim() === "") cutIdx--;
    return lines.slice(0, cutIdx + 1).join("\n");
  }

  return content;
}

export function ensureSubsectionNumbering(
  content: string,
  sectionId: string,
  existingText: string,
): string {
  const major = majorNumberFromSectionId(sectionId);
  if (major == null) return content;

  // 步骤0：去掉末尾的目录结构
  content = stripTrailingTOC(content);

  // 步骤1：去掉所有行首的 Markdown 标题标记
  const lines = content.split("\n");
  const cleanedLines = lines.map((line) => stripMarkdownHeadings(line));

  // 步骤2：检查是否已有层级编号
  const hasSecondLevel = cleanedLines.some((l) => /^\d+\.\d+\b/.test(l) && !/^\d+\.\d+\.\d+/.test(l));
  const hasThirdLevel = cleanedLines.some((l) => /^\d+\.\d+\.\d+\b/.test(l));

  if (hasSecondLevel || hasThirdLevel) {
    // AI 已自行编号 → 检查一级编号是否正确（如 results 章节 AI 不应输出 2.1）
    // 若错误则批量替换为正确的 major 编号
    const firstSecondLevel = cleanedLines.find((l) => /^\d+\.\d+\b/.test(l) && !/^\d+\.\d+\.\d+/.test(l));
    if (firstSecondLevel) {
      const aiMajor = parseInt(firstSecondLevel, 10);
      if (aiMajor !== major && aiMajor > 0 && aiMajor < 10) {
        // 修正所有同级编号：将 "aiMajor.X" 替换为 "major.X"
        return cleanedLines
          .map((l) => {
            // 二级标题: 2.1 → major.1
            const secMatch = l.match(/^(\d+)\.(\d+)\b(.*)/);
            if (secMatch && parseInt(secMatch[1], 10) === aiMajor && !/^\d+\.\d+\.\d+/.test(l)) {
              return `${major}.${secMatch[2]}${secMatch[3]}`;
            }
            // 三级标题: 2.1.1 → major.1.1
            const terMatch = l.match(/^(\d+)\.(\d+)\.(\d+)\b(.*)/);
            if (terMatch && parseInt(terMatch[1], 10) === aiMajor) {
              return `${major}.${terMatch[2]}.${terMatch[3]}${terMatch[4]}`;
            }
            return l;
          })
          .join("\n");
      }
    }
    // AI 编号正确 → 只去掉 Markdown 标记，保留其编号
    return cleanedLines.join("\n");
  }

  // 步骤3：检测 Markdown 标题层级，生成层级编号
  const headingLines = lines.map((line, i) => ({
    original: line,
    cleaned: cleanedLines[i],
    headingLevel: line.match(/^(#{1,6})\s/) ? line.match(/^(#{1,6})\s/)![1].length : 0,
    index: i,
  }));

  const hasHeadings = headingLines.some((h) => h.headingLevel > 0);

  if (!hasHeadings) {
    // 没有标题结构 → 保持原文，不做编号
    return content;
  }

  // 有 Markdown 标题 → 层级编号
  let secCounter = maxSecondLevelInText(existingText, major); // 二级计数器 (major.X)
  let subCounter = 0; // 三级计数器 (major.X.Y)

  const result: string[] = [];

  for (const h of headingLines) {
    if (h.cleaned === "") {
      result.push("");
      continue;
    }

    if (h.headingLevel === 1) {
      // h1 = 章节主标题（编辑器已有 IMRaD 章节标题），保留文本但不编号
      result.push(stripLeadingEnumeration(h.cleaned));
    } else if (h.headingLevel === 2 || h.headingLevel === 3) {
      // h2/h3 = 二级子节 → major.X
      secCounter++;
      subCounter = 0;
      const body = stripLeadingEnumeration(h.cleaned);
      result.push(`${major}.${secCounter} ${body}`);
    } else if (h.headingLevel >= 4 && h.headingLevel <= 6) {
      // h4/h5/h6 = 三级子节 → major.X.Y
      if (secCounter === 0) secCounter = 1;
      subCounter++;
      const body = stripLeadingEnumeration(h.cleaned);
      result.push(`${major}.${secCounter}.${subCounter} ${body}`);
    } else {
      // 正文行，不加编号
      result.push(h.cleaned);
    }
  }

  return result.join("\n");
}

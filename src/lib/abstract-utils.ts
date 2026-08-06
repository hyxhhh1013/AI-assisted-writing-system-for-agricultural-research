/**
 * 摘要写作工具：摘要一般不放文内引用，且应基于已完成正文撰写。
 */

/** 去掉正文型 [n] / [n,m] / [n-m] 引用标记 */
export function stripInlineCitations(text: string): string {
  return text
    .replace(/\[\d+(?:\s*[,，、\-–—]\s*\d+)*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([，。；、,.!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/（\s*）/g, "")
    .trim();
}

/** 除摘要外正文是否具备可注入的实质内容 */
export function hasSubstantialBodySections(
  sections: Record<string, string> | undefined | null,
): boolean {
  if (!sections) return false;
  return Object.entries(sections).some(([key, content]) => {
    if (key === "abstract") return false;
    return (content || "").replace(/\s+/g, "").length >= 80;
  });
}

/** 拼装供摘要写作注入的全文（截断过长章节） */
export function buildAbstractSourceBody(
  sections: Record<string, string> | undefined | null,
  maxPerSection = 2500,
): string {
  if (!sections) return "";
  const parts: string[] = [];
  for (const [key, content] of Object.entries(sections)) {
    if (key === "abstract") continue;
    const text = (content || "").trim();
    if (!text) continue;
    const clipped =
      text.length > maxPerSection ? `${text.slice(0, maxPerSection)}…` : text;
    parts.push(`【${key}】\n${clipped}`);
  }
  return parts.join("\n\n");
}

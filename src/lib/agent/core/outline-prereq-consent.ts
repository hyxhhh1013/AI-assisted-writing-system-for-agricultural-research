/**
 * 写节前缺大纲：先问用户出一版还是贴骨架，不静默 generate_outline。
 * 只认最近一条带「【用户回答】」的用户消息；首条目标里若已有一级标题则直接当骨架。
 */

export const OUTLINE_PREREQ_QUESTION =
  "还没有大纲。回复「出一版」，我按现有材料生成一版给你改；或直接贴上一级标题（每行一个）。回复「先别生成」则先停下。";

export const OUTLINE_PREREQ_HOLD_MESSAGE =
  "已停下。你准备好后把一级标题贴过来，或上传文件名含「大纲」的附件，我再继续写。";

export type OutlinePrereqConsent =
  | { kind: "unset" }
  | { kind: "generate" }
  | { kind: "hold" }
  | { kind: "skeleton"; skeleton: string };

const HOLD_RE = /先别|不要生成|别生成|我自己写|等我|先不生成|先停下/;
const GENERATE_RE =
  /^(出一版|生成(大纲|一版)?|你来出|按现有|可以|好的?|行|继续|嗯|是的?|对)[。!！\s]*$/;

export function looksLikeOutlineSkeleton(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headings = lines.filter((line) =>
    /^(#{1,3}\s+|\d+[.、)]\s*|第[一二三四五六七八九十0-9]+[章节部分]|[-*]\s+)/.test(line),
  );
  return headings.length >= 2;
}

function noteFromUserAnswer(content: string): string | null {
  const marker = "【用户回答】";
  const idx = content.lastIndexOf(marker);
  if (idx < 0) return null;
  return content.slice(idx + marker.length).split("请据此继续")[0]?.trim() ?? "";
}

export function readOutlinePrereqConsent(
  messages: readonly { role: string; content: string }[],
): OutlinePrereqConsent {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;
    const note = noteFromUserAnswer(message.content);
    if (note == null) break;
    if (HOLD_RE.test(note)) return { kind: "hold" };
    if (GENERATE_RE.test(note)) return { kind: "generate" };
    if (looksLikeOutlineSkeleton(note) || note.length >= 12) {
      return { kind: "skeleton", skeleton: note };
    }
    return { kind: "generate" };
  }

  const first = messages.find((message) => message.role === "user");
  if (first && looksLikeOutlineSkeleton(first.content)) {
    return { kind: "skeleton", skeleton: first.content };
  }
  return { kind: "unset" };
}

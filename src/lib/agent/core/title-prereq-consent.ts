/**
 * 生成大纲前必须先确认题目：检索导入后模型常按文献簇自行定题（生物炭环境 vs 热解制油）。
 * 只认最近一条带「【用户回答】」的用户消息。
 */

import type { IntentKind } from "@/contracts/agent-intent";
import { isLiteratureHuntGoal } from "@/lib/agent/core/goal-intents";
import type { ToolObservation } from "@/lib/agent/types";

export const TITLE_PREREQ_HOLD_MESSAGE =
  "已停下。确定论文题目后再说「生成大纲」，或回复「就用当前标题」。";

export type TitlePrereqConsent =
  | { kind: "unset" }
  | { kind: "keep" }
  | { kind: "hold" }
  | { kind: "title"; title: string };

const HOLD_RE = /先别|不要生成|别生成|等我|先停下|先不定题/;
const KEEP_RE =
  /就用当前标题|用现有标题|就这个题目|确认标题|标题没问题|就用这个题|保持标题/;
const SHORT_CONTINUE_RE =
  /^(好|好的|可以|行|继续|嗯|是的?|对|ok|OK|yes)[。!！?？\s]*$/;
/** 检查点空点「继续推进」会写入这句，不能当成新题目 */
const GENERIC_CONTINUE_RE =
  /已收到你的回复|请继续执行|请据此继续|继续推进|按刚才的/;

export function isPlaceholderPaperTitle(title: string | undefined | null): boolean {
  const t = (title ?? "").trim();
  if (!t) return true;
  return /^(未命名(论文|项目)?|新项目|untitled( paper| project)?|new project|论文草稿|草稿)$/i.test(
    t,
  );
}

export function titlePrereqQuestion(currentTitle: string): string {
  const shown = currentTitle.trim() || "（空）";
  return (
    `生成大纲前请先确认本篇题目。当前项目标题：「${shown}」。`
    + "请回复确定的题目（一句话），或回复「就用当前标题」。确认前不会生成大纲。"
  );
}

export function shouldAskTitleBeforeOutline(opts: {
  goal: string;
  intentKind?: IntentKind | null;
  title: string;
  observations: readonly ToolObservation[];
}): boolean {
  if (isPlaceholderPaperTitle(opts.title)) return true;
  if (/确认.{0,8}题目|先定题|先确认题/.test(opts.goal)) return true;
  if (opts.intentKind === "literature") return true;
  if (isLiteratureHuntGoal(opts.goal)) return true;
  return opts.observations.some((o) => o.tool === "import_reference" && o.success);
}

function noteFromUserAnswer(content: string): string | null {
  const marker = "【用户回答】";
  const idx = content.lastIndexOf(marker);
  if (idx < 0) return null;
  return content.slice(idx + marker.length).split("请据此继续")[0]?.trim() ?? "";
}

export function readTitlePrereqConsent(
  messages: readonly { role: string; content: string }[],
  currentTitle: string,
): TitlePrereqConsent {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;
    const note = noteFromUserAnswer(message.content);
    if (note == null) break;
    if (HOLD_RE.test(note)) return { kind: "hold" };
    if (KEEP_RE.test(note)) return { kind: "keep" };
    if (SHORT_CONTINUE_RE.test(note) || GENERIC_CONTINUE_RE.test(note)) {
      return isPlaceholderPaperTitle(currentTitle) ? { kind: "unset" } : { kind: "keep" };
    }
    const firstLine = note.split(/\n/)[0]!.trim();
    if (firstLine.length >= 6 && firstLine.length <= 200) {
      return { kind: "title", title: firstLine };
    }
    return { kind: "unset" };
  }
  return { kind: "unset" };
}

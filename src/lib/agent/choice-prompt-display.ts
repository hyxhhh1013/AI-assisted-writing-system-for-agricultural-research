/** 模型常用全角/弯引号，会导致 ** 加粗解析失败 */
import type { AgentUiMessage } from "@/contracts/agent-session";
import { splitExecSummary } from "@/lib/agent/split-exec-summary";

export function normalizeChoiceMarkdown(raw: string): string {
  return raw
    .replace(/\uFF0A/g, "*")
    .replace(/\u201C|\u201D|\u2018|\u2019/g, '"')
    .replace(/\*\*([^*]+)\*\*/g, (_, inner: string) => `**${inner.trim()}**`);
}

/** 选项序号后不能紧跟数字，避免把「3.2 合成气」拆成选项 3 */
const OPTION_NUM = String.raw`\d{1,2}[.、．](?!\d)`;

/** 模型常把「1. …； 2. …」写在同一行。拆开后 Markdown 才能排成列表。 */
export function formatChoicePrompt(raw: string): string {
  const text = normalizeChoiceMarkdown(raw.trim());
  if (!text) return "请确认一下再继续。";
  const splitBeforeOpt = new RegExp(String.raw`[；;]\s*(?=${OPTION_NUM}\s*)`, "g");
  const splitSpaceBeforeOpt = new RegExp(String.raw`(?<=\S)\s+(?=${OPTION_NUM}\s*)`, "g");
  return text
    .replace(splitBeforeOpt, "\n")
    .replace(splitSpaceBeforeOpt, "\n")
    .replace(/([。！？])\s*(回复\s*[1１])/g, "$1\n\n$2");
}

export interface ParsedChoicePrompt {
  lead: string;
  options: string[];
  tail: string;
}

/** 把「下一步请选 + 编号选项」拆成结构化 UI，不依赖 Markdown 解析 */
function parseDottedChoicePrompt(text: string): ParsedChoicePrompt | null {
  const firstOpt = text.search(new RegExp(OPTION_NUM + String.raw`\s*`));
  if (firstOpt < 0) return null;
  const lead = text.slice(0, firstOpt).replace(/\*\*/g, "").trim();
  const rest = text.slice(firstOpt);
  const optRe = new RegExp(String.raw`(?:^|\n)(\d{1,2})[.、．](?!\d)\s*([^\n]+)`, "g");
  const options: string[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = optRe.exec(rest)) !== null) {
    const line = m[2];
    const beforeReply = line.split(/(?=回复\s*[1１])/)[0] ?? line;
    options.push(
      beforeReply.replace(/\*\*/g, "").replace(/[。．]\s*$/, "").trim(),
    );
    lastEnd = m.index + m[0].length;
  }
  if (options.length < 2) return null;
  const tailRaw = rest.slice(lastEnd).trim();
  const tailMatch = tailRaw.match(/回复\s*[1１][^。\n]*/);
  const tail = (tailMatch?.[0] ?? "")
    .replace(/执行摘要[:：].*$/, "")
    .replace(/\*\*/g, "")
    .trim();
  return { lead, options, tail };
}

/** `- **「1」** = 补引用` 这种不是 `1.` 列表 */
function parseQuotedChoicePrompt(raw: string): ParsedChoicePrompt | null {
  const text = normalizeChoiceMarkdown(raw);
  const optRe =
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?[「"']([1-9])(?:[」"']|\s*\+[^」"'\n]*[」"'])(?:\*\*)?\s*[=＝:：]\s*(.+)/g;
  const byDigit = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(text)) !== null) {
    const n = Number(m[1]);
    const line = (m[2] ?? "")
      .replace(/\*\*/g, "")
      .replace(/[。．]\s*$/, "")
      .trim();
    if (n >= 1 && line) byDigit.set(n, line);
  }
  if (byDigit.size < 2) return null;
  const max = Math.max(...byDigit.keys());
  const options: string[] = [];
  for (let i = 1; i <= max; i++) {
    options.push(byDigit.get(i) ?? "");
  }
  if (options.filter(Boolean).length < 2) return null;
  return { lead: "", options, tail: "" };
}

/** 把「下一步请选 + 编号选项」拆成结构化 UI，不依赖 Markdown 解析 */
export function parseChoicePrompt(raw: string): ParsedChoicePrompt | null {
  const text = formatChoicePrompt(raw);
  return parseDottedChoicePrompt(text) ?? parseQuotedChoicePrompt(raw);
}

const FULLWIDTH_DIGIT: Record<string, string> = {
  "１": "1",
  "２": "2",
  "３": "3",
  "４": "4",
  "５": "5",
  "６": "6",
  "７": "7",
  "８": "8",
  "９": "9",
};

/** 用户只回了「1」时，还原成上轮选项原文，避免 goal=1 丢意图 */
export function parseChoiceDigit(goal: string): number | null {
  const raw = goal.trim();
  const mapped = FULLWIDTH_DIGIT[raw] ?? raw;
  if (!/^[1-9]$/.test(mapped)) return null;
  return Number(mapped);
}

function choiceSourceText(msg: AgentUiMessage): string {
  if (msg.kind === "thought") return msg.text;
  if (msg.kind === "summary") return msg.summary?.text ?? "";
  return "";
}

export function expandChoiceDigitGoal(
  goal: string,
  uiTranscript: readonly AgentUiMessage[] | null | undefined,
): string {
  const digit = parseChoiceDigit(goal);
  if (digit == null || !uiTranscript?.length) return goal;
  for (let i = uiTranscript.length - 1; i >= 0; i--) {
    const text = choiceSourceText(uiTranscript[i]);
    if (!text.trim()) continue;
    const { body } = splitExecSummary(text);
    const parsed = parseChoicePrompt(body);
    const option = parsed?.options[digit - 1]?.trim();
    if (option && !/^\d(\s|$)/.test(option)) return option;
  }
  return goal;
}

import { extractUserChoicePrompt } from "@/lib/agent/core/plan-progress";

/** 从 Agent complete 文案中拆出「执行摘要」块 */

const EXEC_MARKERS = ["执行摘要:", "执行摘要：", "执行摘要\n", "【执行摘要】"];

function findExecSummaryStart(raw: string): number {
  let best = -1;
  for (const marker of EXEC_MARKERS) {
    const idx = raw.indexOf(marker);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  if (best >= 0) return best;
  const glued = raw.search(/[。．]\s*执行摘要[:：]/);
  if (glued >= 0) {
    const inner = raw.slice(glued).search(/执行摘要[:：]/);
    return inner >= 0 ? glued + inner : -1;
  }
  const toolBlock = raw.search(/\[[a-z][\w_]*\]/);
  if (toolBlock > 40) return toolBlock;
  return -1;
}

export function splitExecSummary(text: string | null | undefined): {
  body: string;
  execSummary: string | null;
} {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return { body: "", execSummary: null };

  const idx = findExecSummaryStart(raw);
  if (idx === -1) return { body: raw, execSummary: null };

  let markerLen = 0;
  for (const marker of EXEC_MARKERS) {
    if (raw.startsWith(marker, idx)) {
      markerLen = marker.length;
      break;
    }
  }
  if (markerLen === 0) markerLen = 1;

  const body = raw.slice(0, idx).trim();
  const execSummary = raw.slice(idx + markerLen).trim();
  return {
    body,
    execSummary: execSummary.length > 0 ? execSummary : null,
  };
}

/** 气泡里只保留「请你选 1/2/3」那一段，避免同一屏重复堆工具日志 */
export function compactSummaryBodyForDisplay(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  const choice = extractUserChoicePrompt(trimmed);
  if (!choice) return trimmed;
  const idx = trimmed.indexOf(choice);
  if (idx > 0) return choice;
  if (trimmed.length > choice.length + 40) return choice;
  return trimmed;
}

/** 澄清卡只展示选项，不把工具日志当问题 */
export function isolateClarifyQuestion(raw: string): string {
  const { body } = splitExecSummary(raw);
  const compact = compactSummaryBodyForDisplay(body);
  const picked = compact.trim() || body.trim() || raw.trim();
  return picked.length > 900 ? `${picked.slice(0, 900)}…` : picked;
}

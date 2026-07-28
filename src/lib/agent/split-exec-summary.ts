/** 从 Agent complete 文案中拆出「执行摘要」块 */

export function splitExecSummary(text: string | null | undefined): {
  body: string;
  execSummary: string | null;
} {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return { body: "", execSummary: null };

  const marker = "执行摘要:";
  const idx = raw.indexOf(marker);
  if (idx === -1) return { body: raw, execSummary: null };

  const body = raw.slice(0, idx).trim();
  const execSummary = raw.slice(idx + marker.length).trim();
  return {
    body,
    execSummary: execSummary.length > 0 ? execSummary : null,
  };
}

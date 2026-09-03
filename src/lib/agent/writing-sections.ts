/** Agent 写工具共用的论文章节 key */
export const AGENT_WRITING_SECTIONS = [
  "abstract",
  "introduction",
  "background",
  "literature_body",
  "methods",
  "results",
  "discussion",
  "conclusion",
] as const;

export type AgentWritingSectionKey = (typeof AGENT_WRITING_SECTIONS)[number];

export function isAgentWritingSectionKey(value: string): value is AgentWritingSectionKey {
  return (AGENT_WRITING_SECTIONS as readonly string[]).includes(value);
}

/**
 * 解析工具布尔入参。LLM 可能给 boolean / "true" / "false" / 0 / "0"。
 * 缺省（undefined/null/""）用 defaultValue。
 */
export function parseBoolParam(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  return defaultValue;
}

export function parsePersistToProject(raw: unknown): boolean {
  return parseBoolParam(raw, true);
}

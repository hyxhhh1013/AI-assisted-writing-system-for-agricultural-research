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

export function parsePersistToProject(raw: unknown): boolean {
  if (raw === false || raw === "false" || raw === 0) return false;
  return true;
}

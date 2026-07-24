/** 从 Agent 工具 observation 中解析「已写回章节」 */

export interface AgentSectionPersistedInfo {
  sectionKey: string;
  charCount?: number;
  tool: string;
  referencesAdded?: number;
}

export function extractSectionPersisted(
  tool: string,
  result: { success?: boolean; data?: unknown } | undefined,
): AgentSectionPersistedInfo | null {
  if (!result?.success || result.data == null || typeof result.data !== "object") {
    return null;
  }
  if (tool !== "write_section" && tool !== "refine_content") {
    return null;
  }

  const data = result.data as Record<string, unknown>;
  const persisted = data.persisted;
  if (!persisted || typeof persisted !== "object") return null;

  const sectionKey = String(
    (persisted as { sectionKey?: unknown }).sectionKey
      ?? data.section
      ?? "",
  ).trim();
  if (!sectionKey) return null;

  const referencesAdded = (persisted as { referencesAdded?: unknown }).referencesAdded;
  const charCount = data.charCount;

  return {
    sectionKey,
    tool,
    charCount: typeof charCount === "number" ? charCount : undefined,
    referencesAdded: typeof referencesAdded === "number" ? referencesAdded : undefined,
  };
}

/** 从 Agent 工具 observation 中解析「已写回章节」 */

export interface AgentSectionPersistedInfo {
  sectionKey: string;
  charCount?: number;
  tool: string;
  referencesAdded?: number;
}

const SECTION_WRITE_TOOLS = new Set([
  "write_section",
  "refine_content",
  "apply_revision_item",
  "write_bilingual_abstract",
  "generate_table",
]);

export function extractSectionPersisted(
  tool: string,
  result: { success?: boolean; data?: unknown } | undefined,
): AgentSectionPersistedInfo | null {
  if (!result?.success || result.data == null || typeof result.data !== "object") {
    return null;
  }
  if (!SECTION_WRITE_TOOLS.has(tool)) {
    return null;
  }

  const data = result.data as Record<string, unknown>;

  // generate_table 用 insertedSection 标识已插入章节
  if (tool === "generate_table") {
    const sectionKey = String(data.insertedSection ?? "").trim();
    if (!sectionKey) return null;
    return { sectionKey, tool };
  }

  if (tool === "write_bilingual_abstract") {
    if (data.persisted !== true && data.persisted !== "true") return null;
    return {
      sectionKey: "abstract",
      tool,
      charCount: typeof data.zhChars === "number" ? data.zhChars : undefined,
    };
  }

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

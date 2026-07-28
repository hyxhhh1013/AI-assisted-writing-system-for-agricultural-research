/**
 * W3-AP-READ-BEFORE-WRITE — 引言/讨论起草前必须先读上下文
 * @see docs/plans/W3-AP-BEHAVIOR.md §4
 */

export type ReadBeforeWriteResult =
  | { ok: true }
  | { ok: false; error: string };

const CONTEXT_TOOLS = [
  "inspect_project",
  "read_project_asset",
  "list_references",
  "read_reference",
  "read_section",
  "search_knowledge",
  "search_external",
] as const;

/** 优先硬门禁的章节（易空转瞎写） */
const GATED_SECTIONS = new Set(["introduction", "discussion"]);

const WRITE_TOOLS = new Set(["write_section", "refine_content"]);

function lineMentionsContextTool(line: string): boolean {
  return CONTEXT_TOOLS.some(
    (name) => line.includes(`[${name}]`) || line.includes(`${name}`),
  );
}

/**
 * @param recentToolLines 本会话 toolSummaries（含本轮已执行），形如 `[inspect_project] …`
 */
export function checkReadBeforeWrite(
  toolName: string,
  params: Record<string, unknown>,
  recentToolLines: readonly string[],
): ReadBeforeWriteResult {
  if (!WRITE_TOOLS.has(toolName)) {
    return { ok: true };
  }

  const section = String(params.section ?? "").trim().toLowerCase();
  if (!GATED_SECTIONS.has(section)) {
    return { ok: true };
  }

  const hasContext = recentToolLines.some(lineMentionsContextTool);
  if (!hasContext) {
    return {
      ok: false,
      error:
        `写「${section}」前请先取上下文：inspect_project / read_project_asset(outline) / list_references / read_section。`
        + `读完后再调用 ${toolName}(section=${section})。`,
    };
  }

  return { ok: true };
}

export function isReadBeforeWriteGatedSection(section: string): boolean {
  return GATED_SECTIONS.has(section.trim().toLowerCase());
}

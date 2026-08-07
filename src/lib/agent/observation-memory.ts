import type { AgentToolResult } from "@/contracts/agent";

const MAX_EVIDENCE_CHARS = 2800;
/** 章节正文需要更大窗口，否则 Agent 永远读不全就空转重读 */
const MAX_SECTION_EVIDENCE_CHARS = 7500;

/**
 * 把工具结果写成 Agent 可继续推理的 observation（保留证据，避免只剩「完成」）。
 */
export function formatToolObservationForLlm(
  toolName: string,
  result: { success: boolean; summary?: string; error?: string; data?: unknown },
): string {
  const head = result.success
    ? `[${toolName}] ${result.summary ?? "完成"}`
    : `[${toolName}] 失败: ${result.error ?? "未知错误"}`;

  const evidence = formatEvidence(toolName, result.data);
  if (!evidence) return `Tool result (${toolName}):\n${head}`;
  return `Tool result (${toolName}):\n${head}\n【证据摘录】\n${evidence}`;
}

function formatEvidence(toolName: string, data: unknown): string {
  if (data == null) return "";

  if (
    (toolName === "read_section" || toolName === "read_project_asset")
    && typeof data === "object"
    && data !== null
    && "content" in data
  ) {
    const row = data as {
      section?: string;
      asset?: string;
      chars?: number;
      totalLen?: number;
      offset?: number;
      returnedLen?: number;
      truncated?: boolean;
      hasMoreBefore?: boolean;
      hasMoreAfter?: boolean;
      nextOffset?: number | null;
      hint?: string;
      content?: string;
      empty?: boolean;
    };
    const label = row.section ?? row.asset ?? "?";
    const meta = [
      `target=${label}`,
      row.chars != null ? `字数≈${row.chars}` : null,
      `窗口=${row.offset ?? 0}+${row.returnedLen ?? 0}/${row.totalLen ?? "?"}`,
      row.truncated ? "truncated=true" : "truncated=false",
      row.hint ? `下一步=${row.hint}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const body = String(row.content ?? "");
    return truncate(`${meta}\n\n${body}`, MAX_SECTION_EVIDENCE_CHARS);
  }

  if (
    (toolName === "write_section" || toolName === "refine_content" || toolName === "write_bilingual_abstract")
    && typeof data === "object"
    && data !== null
    && "draft" in data
  ) {
    const row = data as {
      section?: string;
      draft?: string;
      charCount?: number;
      issueCount?: number;
      pipelineMode?: string;
      persisted?: unknown;
    };
    const meta = [
      `target=${row.section ?? "?"}`,
      row.charCount != null ? `字数≈${row.charCount}` : null,
      row.pipelineMode ? `mode=${row.pipelineMode}` : null,
      row.issueCount != null ? `issues=${row.issueCount}` : null,
      row.persisted === false
        ? "persisted=false"
        : row.persisted != null
          ? "persisted=true(已写回项目，可用 read_section 复核)"
          : "persisted=false",
    ]
      .filter(Boolean)
      .join(" | ");
    const body = String(row.draft ?? "");
    return truncate(`${meta}\n\n${body}`, MAX_SECTION_EVIDENCE_CHARS);
  }

  if (typeof data === "object" && data !== null && "items" in data && "markdown" in data) {
    const payload = data as {
      items?: unknown;
      markdown?: unknown;
      verdict?: unknown;
      majorCount?: unknown;
    };
    const md = typeof payload.markdown === "string" ? payload.markdown : "";
    const head = `verdict=${String(payload.verdict ?? "?")} major=${String(payload.majorCount ?? "?")}`;
    return truncate(`${head}\n\n${md}`, MAX_SECTION_EVIDENCE_CHARS);
  }

  if (typeof data === "object" && data !== null && "candidates" in data) {
    const payload = data as {
      candidates?: unknown;
      guidance?: unknown;
      howTo?: unknown;
    };
    const candidates = payload.candidates;
    if (Array.isArray(candidates)) {
      const guidance = typeof payload.guidance === "string" ? payload.guidance : "";
      if (candidates.length === 0) {
        return truncate(guidance || "无可配图候选", MAX_EVIDENCE_CHARS);
      }
      const lines = candidates.slice(0, 12).map((c, i) => {
        if (!c || typeof c !== "object") return `${i}. ${String(c).slice(0, 120)}`;
        const row = c as Record<string, unknown>;
        return `${row.index ?? i}. 「${String(row.title ?? "").slice(0, 80)}」 ${row.figureId ?? row.chartType} ← ${String(row.sourceFileName ?? "").slice(0, 40)}`;
      });
      const how = typeof payload.howTo === "string" ? `\n${payload.howTo}` : "";
      return truncate(`${lines.join("\n")}${how}`, MAX_EVIDENCE_CHARS);
    }
  }

  if (typeof data === "object" && data !== null && "grounding" in data) {
    const payload = data as {
      grounding?: {
        checkedCount?: number;
        suspiciousCount?: number;
        ungroundableCount?: number;
        hint?: string;
        suspicious?: Array<{
          number?: number;
          overlap?: number;
          citedSentence?: string;
          refTitle?: string;
          reason?: string;
        }>;
      };
      gate?: { hint?: string; exportReady?: boolean; passed?: boolean };
    };
    const g = payload.grounding;
    if (g) {
      const head = [
        `checked=${g.checkedCount ?? 0}`,
        `suspicious=${g.suspiciousCount ?? 0}`,
        g.hint ? `hint=${g.hint}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      const lines = (g.suspicious ?? []).slice(0, 8).map((h) => {
        const n = h.number ?? "?";
        const sent = String(h.citedSentence ?? "").slice(0, 100);
        const title = String(h.refTitle ?? "").slice(0, 60);
        return `[${n}] overlap=${((h.overlap ?? 0) * 100).toFixed(0)}% ${title}\n  ${sent}`;
      });
      return truncate(`${head}\n\n${lines.join("\n\n")}`, MAX_EVIDENCE_CHARS);
    }
  }

  if (typeof data === "object" && data !== null && "hits" in data) {
    const hits = (data as { hits?: unknown }).hits;
    if (Array.isArray(hits) && hits.length > 0) {
      const lines = hits.slice(0, 8).map((h, i) => {
        if (!h || typeof h !== "object") return `${i + 1}. ${String(h).slice(0, 200)}`;
        const row = h as Record<string, unknown>;
        const citation = String(row.citation ?? row.source ?? "").slice(0, 120);
        const excerpt = String(row.excerpt ?? row.content ?? "").slice(0, 360);
        return `${i + 1}. ${citation}\n${excerpt}`;
      });
      return truncate(lines.join("\n\n"), MAX_EVIDENCE_CHARS);
    }
  }

  if (typeof data === "string") return truncate(data, MAX_EVIDENCE_CHARS);
  try {
    return truncate(JSON.stringify(data, null, 0), MAX_EVIDENCE_CHARS);
  } catch {
    return "";
  }
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function toObservationPayload(result: AgentToolResult): {
  success: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
} {
  return {
    success: result.success,
    summary: result.summary,
    error: result.error,
    data: result.data,
  };
}

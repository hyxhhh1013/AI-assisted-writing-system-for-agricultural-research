import { callAINonStreaming, getAgentModelConfig } from "@/lib/ai";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

export interface RevisionRoadmapItem {
  id: string;
  reviewer: string;
  severity: "major" | "minor" | "editorial" | "positive";
  raw: string;
  summary: string;
  sectionHint: string;
  action: string;
  commitments: Array<{
    text: string;
    type: string;
    evidenceType: string;
  }>;
}

/**
 * 对齐 academic-paper revision_coach：把非结构化审稿意见解析成修订路线图。
 */
export const parseRevisionCommentsTool: ToolDefinition = {
  name: "parse_revision_comments",
  description:
    "解析审稿人意见（粘贴邮件/PDF 文本均可），输出结构化修订路线图：严重度、章节映射、行动项与承诺点。用户说「我收到审稿意见」「帮我做修订路线图」时使用",
  parameters: {
    type: "object",
    properties: {
      comments: {
        type: "string",
        description: "审稿意见原文（可含多位审稿人）",
      },
      editorLetter: {
        type: "string",
        description: "可选：编辑决定信原文",
      },
    },
    required: ["comments"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const comments = String(params.comments ?? "").trim();
    if (comments.length < 20) {
      return {
        success: false,
        error: "审稿意见过短：请粘贴完整意见（建议 ≥20 字），或确认是否已全部提供",
      };
    }
    if (comments.length > 60_000) {
      return { success: false, error: "审稿意见过长（>60000 字），请分段解析" };
    }

    let sectionCatalog = "（未绑定项目，按通用 IMRaD 猜测章节）";
    if (ctx.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: {
          title: true,
          mode: true,
          sections: { select: { key: true, content: true } },
          outline: true,
        },
      });
      if (project) {
        const filled = project.sections
          .map((s) => {
            const n = (s.content ?? "").replace(/\s+/g, "").length;
            return `${s.key}(${n}字)`;
          })
          .join(", ");
        sectionCatalog = `题目：${project.title}；模式：${project.mode}；章节：${filled || "无"}；大纲前 400 字：${(project.outline ?? "").slice(0, 400)}`;
      }
    }

    const editorLetter = String(params.editorLetter ?? "").trim();

    const system = `你是学术论文修订教练（revision_coach）。把非结构化审稿意见解析为 JSON 路线图。
规则：
1. 不遗漏任何可行动意见；复合意见拆成多条
2. severity: major|minor|editorial|positive
3. sectionHint 尽量映射到英文 key：introduction/methods/results/discussion/conclusion/abstract/references/figures 或 "whole"
4. commitments：从祈使句提取可验收承诺；无则 []
5. 只输出 JSON，不要 markdown 围栏`;

    const user = `【项目章节目录】
${sectionCatalog}

${editorLetter ? `【编辑信】\n${editorLetter.slice(0, 4000)}\n\n` : ""}【审稿意见】
${comments.slice(0, 50_000)}

请输出 JSON：
{
  "verdict": "accept|minor_revision|major_revision|reject|unknown",
  "items": [
    {
      "id": "R1-1",
      "reviewer": "R1",
      "severity": "major",
      "raw": "原文摘录",
      "summary": "一句复述审稿人要求",
      "sectionHint": "discussion",
      "action": "作者应做的具体修改",
      "commitments": [
        { "text": "…", "type": "add_clarification|add_experiment|add_analysis|add_citation|restructure|other", "evidenceType": "prose_edit|new_section|new_figure|new_table|new_citation|methods_paragraph|discussion_paragraph|acknowledgment_only|other" }
      ]
    }
  ],
  "priorityOrder": ["R1-1", "R2-3"],
  "notes": "给作者的简短总评"
}`;

    try {
      const { provider, keyError } = getAgentModelConfig("verifier");
      if (keyError) {
        return { success: false, error: keyError };
      }

      const rawText = await callAINonStreaming({
        provider,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        signal: ctx.signal,
        userId: ctx.userId,
        temperature: 0.2,
        timeoutMs: 120_000,
      });

      const parsed = extractJsonObject(rawText);
      if (!parsed || !Array.isArray(parsed.items)) {
        return {
          success: false,
          error: "模型未能产出合法修订路线图 JSON，请缩短意见后重试",
          data: { rawPreview: rawText.slice(0, 500) },
        };
      }

      const items = normalizeItems(parsed.items);
      const priorityOrder = Array.isArray(parsed.priorityOrder)
        ? parsed.priorityOrder.map(String)
        : items.filter((i) => i.severity === "major").map((i) => i.id);

      const markdown = formatRoadmapMarkdown({
        verdict: String(parsed.verdict ?? "unknown"),
        notes: String(parsed.notes ?? ""),
        items,
        priorityOrder,
      });

      return {
        success: true,
        data: {
          verdict: parsed.verdict ?? "unknown",
          itemCount: items.length,
          majorCount: items.filter((i) => i.severity === "major").length,
          items,
          priorityOrder,
          notes: parsed.notes ?? "",
          markdown,
        },
        summary: `已解析 ${items.length} 条意见（major ${items.filter((i) => i.severity === "major").length}）；建议按 priorityOrder 修订`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `解析失败: ${message}` };
    }
  },
};

function normalizeItems(raw: unknown[]): RevisionRoadmapItem[] {
  const out: RevisionRoadmapItem[] = [];
  raw.forEach((row, idx) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const severityRaw = String(r.severity ?? "minor");
    const severity =
      severityRaw === "major"
      || severityRaw === "editorial"
      || severityRaw === "positive"
        ? severityRaw
        : "minor";
    const commitmentsRaw = Array.isArray(r.commitments) ? r.commitments : [];
    out.push({
      id: String(r.id ?? `ITEM-${idx + 1}`),
      reviewer: String(r.reviewer ?? "Unknown"),
      severity,
      raw: String(r.raw ?? "").slice(0, 800),
      summary: String(r.summary ?? "").slice(0, 300),
      sectionHint: String(r.sectionHint ?? "whole").slice(0, 40),
      action: String(r.action ?? "").slice(0, 400),
      commitments: commitmentsRaw
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
        .slice(0, 6)
        .map((c) => ({
          text: String(c.text ?? "").slice(0, 200),
          type: String(c.type ?? "other").slice(0, 40),
          evidenceType: String(c.evidenceType ?? "other").slice(0, 40),
        })),
    });
  });
  return out;
}

function formatRoadmapMarkdown(input: {
  verdict: string;
  notes: string;
  items: RevisionRoadmapItem[];
  priorityOrder: string[];
}): string {
  const lines = [
    `## 修订路线图`,
    `总体判断：${input.verdict}`,
    input.notes ? `总评：${input.notes}` : "",
    `优先顺序：${input.priorityOrder.join(" → ") || "（无）"}`,
    "",
  ].filter(Boolean);

  for (const item of input.items) {
    lines.push(
      `### ${item.id} [${item.severity}] ${item.reviewer} → ${item.sectionHint}`,
    );
    lines.push(`- 要求：${item.summary || item.raw.slice(0, 120)}`);
    lines.push(`- 行动：${item.action || "（待定）"}`);
    if (item.commitments.length) {
      lines.push(
        `- 承诺：${item.commitments.map((c) => c.text).join("；")}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

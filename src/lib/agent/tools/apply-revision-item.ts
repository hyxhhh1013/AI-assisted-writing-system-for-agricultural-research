import { persistAgentDraft } from "@/lib/agent/project-persist";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
  type AgentWritingSectionKey,
} from "@/lib/agent/writing-sections";
import { runAgentRefineContent } from "@/lib/agent/writing-runner";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { isSectionValidForMode } from "@/lib/section-registry";
import prisma from "@/lib/prisma";

/** 把路线图 sectionHint 映射到项目章节 key */
export function mapSectionHintToKey(hint: string): AgentWritingSectionKey | null {
  const h = hint.trim().toLowerCase();
  if (isAgentWritingSectionKey(h)) return h;
  const aliases: Record<string, AgentWritingSectionKey> = {
    intro: "introduction",
    "introduction": "introduction",
    引言: "introduction",
    background: "background",
    背景: "background",
    lit: "literature_body",
    literature: "literature_body",
    "lit review": "literature_body",
    综述: "literature_body",
    method: "methods",
    methodology: "methods",
    方法: "methods",
    result: "results",
    结果: "results",
    discuss: "discussion",
    讨论: "discussion",
    conclude: "conclusion",
    结论: "conclusion",
    abs: "abstract",
    摘要: "abstract",
  };
  if (aliases[h]) return aliases[h];
  for (const key of AGENT_WRITING_SECTIONS) {
    if (h.includes(key)) return key;
  }
  return null;
}

/**
 * 按 parse_revision_comments 的单条意见修正对应章节并写回。
 */
export const applyRevisionItemTool: ToolDefinition = {
  name: "apply_revision_item",
  description:
    "根据修订路线图单条意见修正章节：自动读正文 → Refiner 按意见改 → 默认写回。先 parse_revision_comments，再对本条调用；positive 意见勿调用",
  parameters: {
    type: "object",
    properties: {
      itemId: { type: "string", description: "意见 id，如 R1-1" },
      severity: {
        type: "string",
        enum: ["major", "minor", "editorial", "positive"],
        description: "严重度；positive 会拒绝执行",
      },
      summary: { type: "string", description: "意见摘要" },
      action: { type: "string", description: "建议行动" },
      raw: { type: "string", description: "审稿原文摘录" },
      sectionHint: {
        type: "string",
        description: "章节提示，如 discussion / introduction",
      },
      section: {
        type: "string",
        description: "覆盖 sectionHint，直接指定章节 key",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      persistToProject: {
        type: "string",
        description: "是否写回（默认 true）",
      },
    },
    required: ["action"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "apply_revision_item 需要绑定 projectId" };
    }

    const severity = String(params.severity ?? "minor");
    if (severity === "positive") {
      return {
        success: false,
        error: "positive 意见无需改稿，可在回复信中致谢",
      };
    }

    const action = String(params.action ?? "").trim();
    const summary = String(params.summary ?? "").trim();
    const raw = String(params.raw ?? "").trim();
    const itemId = String(params.itemId ?? "").trim() || "ITEM";
    if (!action && !summary && !raw) {
      return { success: false, error: "缺少 action/summary/raw" };
    }

    let sectionKey: AgentWritingSectionKey | null = null;
    if (params.section && isAgentWritingSectionKey(String(params.section))) {
      sectionKey = String(params.section) as AgentWritingSectionKey;
    } else {
      sectionKey = mapSectionHintToKey(String(params.sectionHint ?? ""));
    }
    if (!sectionKey) {
      return {
        success: false,
        error:
          `无法映射章节（sectionHint=${String(params.sectionHint ?? "")}）。请传 section=introduction|methods|…`,
      };
    }

    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }
    if (!isSectionValidForMode(sectionKey, project.mode)) {
      return {
        success: false,
        error: `章节 ${sectionKey} 与项目类型 ${project.mode} 不匹配`,
      };
    }

    let draftText = "";
    if (sectionKey === "abstract") {
      const row = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: { abstract: true },
      });
      draftText = row?.abstract ?? "";
    } else {
      const row = await prisma.section.findFirst({
        where: { projectId: ctx.projectId, key: sectionKey },
        select: { content: true },
      });
      draftText = row?.content ?? "";
    }

    if (!draftText.trim()) {
      return {
        success: false,
        error: `章节 ${sectionKey} 为空，请先 write_section 再按审稿意见修改`,
      };
    }

    const feedback = [
      `【修订意见 ${itemId}｜${severity}】`,
      summary ? `摘要：${summary}` : "",
      raw ? `原文：${raw}` : "",
      `行动要求：${action}`,
      "请仅针对上述意见修改正文，保持学术语气，不要加入编辑备注。",
    ]
      .filter(Boolean)
      .join("\n");

    const persistToProject = parsePersistToProject(params.persistToProject);

    try {
      const result = await runAgentRefineContent({
        draft: draftText,
        feedback,
        contextText: "",
        maxRefIndex: project.references.length,
        projectMode: project.mode,
        userId: ctx.userId,
        signal: ctx.signal,
      });

      let persisted: { sectionKey: string; referencesAdded: number } | null = null;
      if (persistToProject) {
        persisted = await persistAgentDraft(
          ctx.userId,
          ctx.projectId,
          sectionKey,
          result.draft,
        );
      }

      return {
        success: true,
        data: {
          itemId,
          section: sectionKey,
          severity,
          charCount: result.charCount,
          persisted,
          draftPreview: result.draft.slice(0, 400),
        },
        summary: persisted
          ? `已按 ${itemId} 修正并写回 ${sectionKey}（${result.charCount} 字）`
          : `已按 ${itemId} 修正 ${sectionKey}（未写回，${result.charCount} 字）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

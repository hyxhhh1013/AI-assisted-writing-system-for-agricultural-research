import prisma from "@/lib/prisma";
import { validateCitations } from "@/lib/citation";
import { evaluateCitationGate } from "@/lib/citation-gate";
import {
  evaluateCitationGrounding,
  refsFromLiteRows,
} from "@/lib/citation-grounding";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const validateCitationsTool: ToolDefinition = {
  name: "validate_citations",
  description:
    "一次检查全文引用（硬检越界 + 语义可疑项 + soft 池未引用）。优先于逐条 read_reference；"
    + "可省略 draftText 自动用项目全文。交付前必调；核查任务第一步应调用本工具",
  parameters: {
    type: "object",
    properties: {
      draftText: {
        type: "string",
        description: "待检查的正文（含 [1] 等引用）；省略则使用当前项目全文",
      },
      contextText: {
        type: "string",
        description: "可选：旧版全池词重叠上下文；省略则自动用各条题录/摘要做语义接地",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    let draftText = String(params.draftText ?? "");
    let contextText = String(params.contextText ?? "");
    let refCount = 0;

    if (!ctx.projectId) {
      return {
        success: false,
        error: "validate_citations 需要绑定项目，才能对照真实参考文献数量",
      };
    }

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: {
        abstract: true,
        sections: { select: { content: true } },
      },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const references = await findReferenceRowsLite(ctx.projectId, ctx.userId);
    refCount = references.length;
    if (!draftText.trim()) {
      draftText = [project.abstract ?? "", ...project.sections.map((s) => s.content)]
        .filter(Boolean)
        .join("\n\n");
    }
    if (!contextText.trim()) {
      contextText = references
        .map((r, i) => {
          const abs = r.abstract?.trim();
          const head = `[${i + 1}] ${r.title || r.content}`;
          return abs ? `${head}\n${abs.slice(0, 1500)}` : head;
        })
        .join("\n\n");
    }

    if (!draftText.trim()) {
      return { success: false, error: "draftText 不能为空（或绑定有正文的项目）" };
    }

    const gate = evaluateCitationGate({
      texts: [draftText],
      refCount,
    });

    const grounding = evaluateCitationGrounding({
      draftText,
      references: refsFromLiteRows(references),
    });

    const checks = contextText.trim()
      ? validateCitations(draftText, contextText)
      : [];
    const overlapIssues = checks.filter((c) => !c.passed || c.overlap < 0.15);

    await syncProjectPaperPassport(ctx.projectId).catch(() => null);

    const blocked = !gate.exportReady;
    const soft = grounding.softPool;
    const softHint =
      soft.unusedRatio != null && soft.unusedRatio >= 0.5
        ? `；soft 池未引用 ${soft.softUnusedCount}/${soft.softGroundableCount}`
        : "";

    let summary: string;
    if (blocked) {
      summary = `引用硬检未通过：${gate.hint}`;
    } else if (!gate.passed) {
      summary = `可导出，但 Phase 5 未完成：${gate.hint}`;
    } else if (grounding.suspiciousCount > 0) {
      summary = `硬检通过，但有 ${grounding.suspiciousCount} 处语义可疑引用：${grounding.hint}${softHint}`;
    } else if (overlapIssues.length > 0) {
      summary = `硬检通过，语义接地未见明显错引；全池重叠低 ${overlapIssues.length} 处可人工核对${softHint}`;
    } else {
      summary = `引用检查通过（硬检 OK，语义接地 OK，${checks.length || gate.citationCount} 处引用）${softHint}`;
    }

    return {
      success: true,
      data: {
        gate,
        exportReady: gate.exportReady,
        phase5Passed: gate.passed,
        grounding: {
          checkedCount: grounding.checkedCount,
          suspiciousCount: grounding.suspiciousCount,
          ungroundableCount: grounding.ungroundableCount,
          hint: grounding.hint,
          softPool: grounding.softPool,
          suspicious: grounding.hits.filter((h) => h.suspicious).slice(0, 8),
        },
        totalChecks: checks.length,
        overlapIssueCount: overlapIssues.length,
        overlapIssues: overlapIssues.map((c) => ({
          number: c.number,
          passed: c.passed,
          overlap: c.overlap,
          citedSentence: c.citedSentence?.slice(0, 120),
        })),
      },
      summary,
    };
  },
};

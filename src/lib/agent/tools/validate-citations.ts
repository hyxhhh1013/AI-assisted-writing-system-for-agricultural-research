import prisma from "@/lib/prisma";
import { validateCitations } from "@/lib/citation";
import { evaluateCitationGate } from "@/lib/citation-gate";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const validateCitationsTool: ToolDefinition = {
  name: "validate_citations",
  description:
    "检查正文引用：① 编号是否超出项目参考文献数量（硬门禁）；② 与检索上下文的词重叠。越界则不可标「可过稿」",
  parameters: {
    type: "object",
    properties: {
      draftText: {
        type: "string",
        description: "待检查的正文（含 [1] 等引用）；省略则使用当前项目全文",
      },
      contextText: {
        type: "string",
        description: "RAG 检索上下文或参考文献摘要文本；省略则用项目参考文献拼接",
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

    // 只用真实文献数，禁止用正文最大编号伪装 refCount
    const gate = evaluateCitationGate({
      texts: [draftText],
      refCount,
    });

    const checks = contextText.trim()
      ? validateCitations(draftText, contextText)
      : [];
    const overlapIssues = checks.filter((c) => !c.passed || c.overlap < 0.15);

    await syncProjectPaperPassport(ctx.projectId).catch(() => null);

    const blocked = !gate.exportReady;
    return {
      success: true,
      data: {
        gate,
        exportReady: gate.exportReady,
        phase5Passed: gate.passed,
        totalChecks: checks.length,
        overlapIssueCount: overlapIssues.length,
        overlapIssues: overlapIssues.map((c) => ({
          number: c.number,
          passed: c.passed,
          overlap: c.overlap,
          citedSentence: c.citedSentence?.slice(0, 120),
        })),
      },
      summary: blocked
        ? `引用硬检未通过：${gate.hint}`
        : !gate.passed
          ? `可导出，但 Phase 5 未完成：${gate.hint}`
          : overlapIssues.length === 0
            ? `引用检查通过（硬检 OK，${checks.length || gate.citationCount} 处引用）`
            : `硬检通过，但有 ${overlapIssues.length} 处低重叠引用需人工核对`,
    };
  },
};

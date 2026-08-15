import prisma from "@/lib/prisma";
import { validateCitations } from "@/lib/citation";
import { evaluateCitationGate } from "@/lib/citation-gate";
import {
  evaluateCitationGrounding,
  refsFromLiteRows,
} from "@/lib/citation-grounding";
import {
  createLLMClaimJudge,
  evaluateCitationClaimGrounding,
} from "@/lib/citation-claim-grounding";
import type { ClaimGroundingReport } from "@/contracts/citation-claim-grounding";
import {
  isCitationClaimGroundingCloseOut,
  shouldRunCitationClaimGrounding,
} from "@/lib/agent/citation-claim-policy";
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

    // 引用级 grounding：收口路径默认开（写节 reflect 自查不跑）；=0/false/off 全局关。
    // 失败（无 key / 超时 / 解析失败）降级为 null，不阻断 validate_citations 主流程。
    let claimGrounding: ClaimGroundingReport | null = null;
    const closeOut = isCitationClaimGroundingCloseOut(ctx.goal ?? "", ctx.intentKind);
    if (
      shouldRunCitationClaimGrounding({
        hasAbstracts: references.some((r) => r.abstract?.trim()),
        env: process.env.CITATION_CLAIM_GROUNDING,
        closeOut,
      })
    ) {
      try {
        claimGrounding = await evaluateCitationClaimGrounding(
          { draftText, references: refsFromLiteRows(references) },
          createLLMClaimJudge({ signal: ctx.signal, userId: ctx.userId }),
        );
      } catch {
        claimGrounding = null;
      }
    }

    await syncProjectPaperPassport(ctx.projectId).catch(() => null);

    const blocked = !gate.exportReady;
    const soft = grounding.softPool;
    const softHint =
      soft.unusedRatio != null && soft.unusedRatio >= 0.5
        ? `；soft 池未引用 ${soft.softUnusedCount}/${soft.softGroundableCount}`
        : "";

    let summary: string;
    if (blocked) {
      summary = `引用硬检未通过：${gate.hint}【必须修正越界编号后才能继续，请直接改引或删引】`;
    } else if (!gate.passed) {
      summary = `可导出，但 Phase 5 未完成：${gate.hint}`;
    } else if (grounding.suspiciousCount > 0) {
      // 软可疑（语义勉强/缺摘要无法判定）≠ 必须修的硬错引：
      // 明确给 Agent 收敛出口，避免「改一处→重验→又报另一处」的无限打地鼠循环。
      // 可判定且确实错引的才改；缺摘要/语义勉强可接受或改引一次，不要反复重验。
      summary =
        `硬检通过，${grounding.suspiciousCount} 处语义可疑引用（${grounding.hint}${softHint}）。`
        + `判断：优先修正【可判定且明显错引】的编号（改引或删引）；`
        + `【缺摘要/语义勉强】属软性提示，可接受或改引一次，不要反复 validate 重验——`
        + `修完这轮即可向用户汇报并给出下一步`;
    } else if (overlapIssues.length > 0) {
      summary = `硬检通过，语义接地未见明显错引；全池重叠低 ${overlapIssues.length} 处可人工核对${softHint}`;
    } else {
      summary = `引用检查通过（硬检 OK，语义接地 OK，${checks.length || gate.citationCount} 处引用）${softHint}。引用已符合要求，无需再改，请向用户汇报并给出下一步`;
    }

    if (claimGrounding) {
      summary += `\n【claim 接地】${claimGrounding.hint}`;
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
        claimGrounding: claimGrounding
          ? {
              judgedCount: claimGrounding.judgedCount,
              supportCount: claimGrounding.supportCount,
              contradictCount: claimGrounding.contradictCount,
              neutralCount: claimGrounding.neutralCount,
              skippedCount: claimGrounding.skippedCount,
              supportRate: claimGrounding.supportRate,
              hint: claimGrounding.hint,
              contradict: claimGrounding.items
                .filter((i) => i.verdict === "contradict")
                .slice(0, 8),
            }
          : null,
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

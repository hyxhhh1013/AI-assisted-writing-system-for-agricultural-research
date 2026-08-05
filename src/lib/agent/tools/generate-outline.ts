import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { matchCategoryFromDirection } from "@/lib/knowledge-metadata";
import {
  enforceOutlineAgainstSkeleton,
  getDefaultUserSkeleton,
  scrubForbiddenReviewHeadings,
} from "@/lib/outline-skeleton";
import { buildOutlinePrompt } from "@/lib/prompts";
import prisma from "@/lib/prisma";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { formatRagCitation, localRAG } from "@/lib/rag";

/**
 * Phase 2 / academic-paper structure_architect：生成大纲并写回项目。
 * 让 Agent 自主补齐架构，而不是把用户踢回提纲 Tab。
 */
export const generateOutlineTool: ToolDefinition = {
  name: "generate_outline",
  description:
    "基于题目与研究方向生成论文大纲（Markdown），默认写回项目；对应 academic-paper Phase 2 架构",
  parameters: {
    type: "object",
    properties: {
      userSkeleton: {
        type: "string",
        description:
          "可选：一级标题骨架，每行一条；缺省按综述/研究模式使用默认骨架",
      },
      persistToProject: {
        type: "string",
        description: "是否写回项目 outline（默认 true）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_outline 需要 projectId" };
    }

    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const persist =
      params.persistToProject === undefined
      || params.persistToProject === true
      || params.persistToProject === "true"
      || params.persistToProject === "1";

    let skeleton = getDefaultUserSkeleton(project.mode);
    if (typeof params.userSkeleton === "string" && params.userSkeleton.trim()) {
      const lines = params.userSkeleton
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length >= 3) skeleton = lines;
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) return { success: false, error: keyError };

    const title = project.title.trim() || "未命名论文";
    const researchDirection =
      project.researchDirection.trim() || title;
    const targetCategory = await matchCategoryFromDirection(researchDirection);
    const contextChunks = await localRAG.search(`${title} ${researchDirection}`, {
      limit: 10,
      category: targetCategory || undefined,
    });
    const contextText = contextChunks
      .map((c) => {
        const cleaned = c.content.replace(/\[(\d+[\d,\s\-–—]*)\]/g, "[文献$1]");
        return `[来自文献: ${formatRagCitation(c)}]\n${cleaned}`;
      })
      .join("\n\n");

    const systemPrompt = buildOutlinePrompt({
      title,
      researchDirection,
      language: project.language,
      contextText,
      projectMode: project.mode,
      userSkeleton: skeleton,
    });

    const response = await callAI({
      provider,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `论文题目：${title}\n研究方向：${researchDirection}`,
        },
      ],
      stream: false,
      timeoutMs: 120_000,
      signal: ctx.signal,
      userId: ctx.userId,
    });

    const rawJson = await response.json();
    let outline: string =
      rawJson?.choices?.[0]?.message?.content?.trim() || "";
    if (!outline) {
      return { success: false, error: "AI 未返回大纲内容" };
    }

    outline = enforceOutlineAgainstSkeleton(outline, skeleton);
    if (project.mode === "review") {
      outline = scrubForbiddenReviewHeadings(outline, skeleton);
    }

    if (persist) {
      await prisma.project.update({
        where: { id: ctx.projectId },
        data: { outline },
      });
      try {
        await syncProjectPaperPassport(ctx.projectId);
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      data: {
        chars: outline.replace(/\s+/g, "").length,
        preview: outline.slice(0, 1200),
        persisted: persist,
      },
      summary: persist
        ? `已生成并写回大纲（约 ${outline.replace(/\s+/g, "").length} 字）`
        : `已生成大纲预览（约 ${outline.replace(/\s+/g, "").length} 字，未写回）`,
    };
  },
};

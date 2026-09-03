import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  buildFrameworkPromptBlock,
  parseUserSkeletonLines,
  pickOutlineSkeleton,
  resolveOutlineFramework,
  type OutlineAttachmentCandidate,
} from "@/lib/agent/outline-from-attachment";
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

async function loadOutlineAttachmentCandidates(
  ctx: AgentContext,
): Promise<OutlineAttachmentCandidate[]> {
  const scopes = [
    ...(ctx.sessionId ? [{ sessionId: ctx.sessionId }] : []),
    ...(ctx.projectId ? [{ pinned: true, projectId: ctx.projectId }] : []),
  ];
  if (scopes.length === 0) return [];
  const rows = await prisma.agentAttachment.findMany({
    select: {
      id: true,
      originalName: true,
      status: true,
      extractedText: true,
    },
    where: { userId: ctx.userId, OR: scopes },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((r) => ({
    id: r.id,
    originalName: r.originalName,
    status: r.status,
    extractedText: r.extractedText ?? "",
  }));
}

/**
 * Phase 2 / academic-paper structure_architect：生成大纲并写回项目。
 * 有大纲/框架附件时服务端先读附件锁一级标题，不依赖模型自觉。
 */
export const generateOutlineTool: ToolDefinition = {
  name: "generate_outline",
  description:
    "基于题目与研究方向生成论文大纲（Markdown），默认写回项目。"
    + "若本会话有大纲/框架类附件（或传入 attachmentId），会先读附件并按其一级标题写回，禁止另起炉灶。"
    + "写回后必须等用户批准检查点，不要接着生成蓝图。",
  parameters: {
    type: "object",
    properties: {
      userSkeleton: {
        type: "string",
        description:
          "可选：一级标题骨架，每行一条；有框架附件时以附件标题为准",
      },
      attachmentId: {
        type: "string",
        description: "可选：指定本会话大纲/框架附件 id；不传则自动挑选像大纲的文档",
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

    const attachmentId =
      typeof params.attachmentId === "string" ? params.attachmentId.trim() : "";
    const resolved = resolveOutlineFramework({
      attachmentId: attachmentId || undefined,
      attachments: await loadOutlineAttachmentCandidates(ctx),
    });
    if (resolved.status === "error") {
      return { success: false, error: resolved.error };
    }
    const framework = resolved.status === "used" ? resolved.framework : null;
    const picked = pickOutlineSkeleton({
      framework,
      paramSkeleton: parseUserSkeletonLines(
        typeof params.userSkeleton === "string" ? params.userSkeleton : undefined,
      ),
      defaultSkeleton: getDefaultUserSkeleton(project.mode),
    });
    const skeleton = picked.skeleton;
    const lockedByAttachment = picked.lockedByAttachment;

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
      skeletonFromAttachment: lockedByAttachment,
      frameworkBlock: framework ? buildFrameworkPromptBlock(framework) : undefined,
    });

    const userPayload = [
      `论文题目：${title}`,
      `研究方向：${researchDirection}`,
      framework
        ? `已读取附件「${framework.fileName}」作为框架底稿；一级标题不得改写。`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await callAI({
      provider,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
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
    if (project.mode === "review" && !lockedByAttachment) {
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

    const chars = outline.replace(/\s+/g, "").length;
    const frameworkHint = framework
      ? `已按附件「${framework.fileName}」${lockedByAttachment ? "锁定一级标题" : "作为底稿"}，`
      : "";
    return {
      success: true,
      data: {
        chars,
        preview: outline.slice(0, 1200),
        persisted: persist,
        ...(framework
          ? {
              frameworkAttachment: {
                id: framework.attachmentId,
                fileName: framework.fileName,
                headings: framework.headings,
                locked: lockedByAttachment,
              },
            }
          : {}),
      },
      summary: persist
        ? `${frameworkHint}已生成并写回大纲（约 ${chars} 字）。请等用户确认后再进入蓝图。`
        : `${frameworkHint}已生成大纲预览（约 ${chars} 字，未写回）`,
    };
  },
};

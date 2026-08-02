import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

/** 列出本会话（或已 pin 到当前项目）的附件：id/文件名/类型/字数/提取状态。 */
export const listAttachmentsTool: ToolDefinition = {
  name: "list_attachments",
  description: "列出本会话（或已 pin 到当前项目）的附件：id/文件名/类型/字数/提取状态。",
  parameters: { type: "object", properties: {}, required: [] },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    void params;
    const scopes = [
      ...(ctx.sessionId ? [{ sessionId: ctx.sessionId }] : []),
      ...(ctx.projectId ? [{ pinned: true, projectId: ctx.projectId }] : []),
    ];
    const rows =
      scopes.length === 0
        ? []
        : await prisma.agentAttachment.findMany({
            where: {
              userId: ctx.userId,
              OR: scopes,
            },
            orderBy: { createdAt: "desc" },
            take: 30,
          });
    return {
      success: true,
      summary: rows.length === 0 ? "当前无附件" : `共 ${rows.length} 个附件`,
      data: {
        attachments: rows.map((r) => ({
          id: r.id,
          name: r.originalName,
          status: r.status,
          source: r.extractSource,
          chars: r.extractedText?.length ?? 0,
          pinned: r.pinned,
        })),
      },
    };
  },
};

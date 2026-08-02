import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";
import { READ_ATTACHMENT_DEFAULT_CHARS, READ_ATTACHMENT_MAX_CHARS } from "@/lib/agent/attachments/constants";

/**
 * 读取本会话已上传附件的内容（会话级；已 pin 转项目级的按 projectId 校验归属）。
 * 长文分页：part="head"|"tail"，或用 offset（字符起点）+ maxChars。
 */
export const readAttachmentTool: ToolDefinition = {
  name: "read_attachment",
  description:
    "读取本会话已上传附件的内容。长文本分页：part=\"head\"|\"tail\"，或用 offset（字符起点）+ maxChars。"
    + "读图/读数据文件同样用本工具（已提取为文本/表格）。",
  parameters: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "附件 id（来自 goal 里的附件清单或 list_attachments）" },
      part: { type: "string", enum: ["head", "tail"], description: "读开头/结尾（二选一，默认 head）" },
      offset: { type: "number", description: "字符起点（与 part 二选一）" },
      maxChars: { type: "number", description: `返回最大字符数（默认 ${READ_ATTACHMENT_DEFAULT_CHARS}，上限 ${READ_ATTACHMENT_MAX_CHARS}）` },
    },
    required: ["fileId"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const fileId = String(params.fileId ?? "").trim();
    if (!fileId) return { success: false, error: "缺少 fileId" };

    const row = await prisma.agentAttachment.findFirst({
      where: { id: fileId, userId: ctx.userId },
    });
    if (!row) return { success: false, error: "附件不存在或无权访问" };
    // 兜底：where 已按 userId 过滤，此处再防御一次（查询竞态/测试场景）
    if (row.userId !== ctx.userId) {
      return { success: false, error: "附件不存在或无权访问" };
    }
    // 归属：会话级须匹配当前会话；已 pin 转项目级则校验 projectId
    const sessionOk = row.sessionId == null || row.sessionId === ctx.sessionId;
    const projectOk = !row.pinned || (ctx.projectId != null && row.projectId === ctx.projectId);
    if (!sessionOk || !projectOk) {
      return { success: false, error: "该附件不属于当前会话/项目" };
    }

    if (row.status === "extracting") {
      return { success: false, error: "附件仍在提取中，请稍后重试" };
    }
    if (row.status !== "ready" || !row.extractedText) {
      return { success: false, error: "附件未能提取内容，仅可查看文件名/预览" };
    }

    const text = row.extractedText;
    const maxChars = Math.min(
      typeof params.maxChars === "number" && params.maxChars > 0 ? Math.floor(params.maxChars) : READ_ATTACHMENT_DEFAULT_CHARS,
      READ_ATTACHMENT_MAX_CHARS,
    );
    const part = params.part === "tail" ? "tail" : "head";
    let start = 0;
    if (params.offset != null && typeof params.offset === "number" && params.offset > 0) {
      start = Math.floor(params.offset);
    } else if (part === "tail") {
      start = Math.max(0, text.length - maxChars);
    }
    const window = text.slice(start, start + maxChars);
    const hasMore = start + maxChars < text.length;
    return {
      success: true,
      summary: `已读取 ${row.originalName}（${window.length} 字符${hasMore ? "，还有更多" : ""}）`,
      data: {
        text: window,
        offset: start,
        hasMore,
        totalChars: text.length,
        truncated: row.status === "ready" && window.length < text.length,
      },
    };
  },
};

import { loadAgentProject } from "@/lib/agent/project-loader";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

/** 单次窗口上限（避免撑爆上下文）；长文用 offset / part=tail 分段读 */
const MAX_CHARS = 8000;
const DEFAULT_CHARS = 4000;

/**
 * 按需读取某一章节正文，避免只靠字数摘要瞎写。
 * 长文只返回窗口，须用 offset 或 part=tail 读后续/末尾。
 */
export const readSectionTool: ToolDefinition = {
  name: "read_section",
  description:
    "读取项目中某一章节正文。长文会按窗口截断：用 part=tail 读结尾（研究空白/目标陈述常在末尾），或用 offset 从指定字符继续读。禁止对同一窗口反复重读。",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "章节 key，如 introduction、methods、literature_body、abstract",
        enum: [...AGENT_WRITING_SECTIONS],
      },
      maxChars: {
        type: "number",
        description: `本窗口最多返回字符数，默认 ${DEFAULT_CHARS}，上限 ${MAX_CHARS}`,
      },
      offset: {
        type: "number",
        description: "从正文第几个字符开始读（0 起）。与 part=tail 互斥，优先 offset",
      },
      part: {
        type: "string",
        description: "head=开头（默认）；tail=末尾窗口（判断引言是否收尾时用）",
        enum: ["head", "tail"],
      },
    },
    required: ["section"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "read_section 需要绑定 projectId" };
    }
    const section = String(params.section ?? "").trim();
    if (!isAgentWritingSectionKey(section)) {
      return { success: false, error: `无效章节: ${section}` };
    }

    const project = await loadAgentProject(ctx.userId, ctx.projectId);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    let content = "";
    if (section === "abstract") {
      const row = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: { abstract: true },
      });
      content = row?.abstract ?? "";
    } else {
      const row = await prisma.section.findFirst({
        where: { projectId: ctx.projectId, key: section },
        select: { content: true },
      });
      content = row?.content ?? "";
    }

    const limit = Math.min(
      Math.max(Number(params.maxChars) || DEFAULT_CHARS, 200),
      MAX_CHARS,
    );
    const totalLen = content.length;
    const chars = content.replace(/\s+/g, "").length;

    if (totalLen === 0) {
      return {
        success: true,
        data: {
          section,
          chars: 0,
          totalLen: 0,
          offset: 0,
          returnedLen: 0,
          truncated: false,
          hasMoreBefore: false,
          hasMoreAfter: false,
          content: "（本章节尚无正文）",
        },
        summary: `章节 ${section} 为空`,
      };
    }

    const part = String(params.part ?? "head").trim() === "tail" ? "tail" : "head";
    const rawOffset = Number(params.offset);
    let start = 0;
    if (Number.isFinite(rawOffset) && rawOffset >= 0) {
      start = Math.min(Math.floor(rawOffset), Math.max(totalLen - 1, 0));
    } else if (part === "tail") {
      start = Math.max(totalLen - limit, 0);
    }

    const end = Math.min(start + limit, totalLen);
    const slice = content.slice(start, end);
    const hasMoreBefore = start > 0;
    const hasMoreAfter = end < totalLen;
    const truncated = hasMoreBefore || hasMoreAfter;

    const hints: string[] = [];
    if (hasMoreAfter) {
      hints.push(`还有后续：再调 read_section(section="${section}", offset=${end})`);
    }
    if (hasMoreBefore && part !== "tail") {
      hints.push(`要看结尾：read_section(section="${section}", part="tail")`);
    }

    const body =
      (hasMoreBefore ? "…[前文省略]\n" : "")
      + slice
      + (hasMoreAfter ? "\n…[后文省略]" : "");

    return {
      success: true,
      data: {
        section,
        chars,
        totalLen,
        offset: start,
        returnedLen: slice.length,
        truncated,
        hasMoreBefore,
        hasMoreAfter,
        nextOffset: hasMoreAfter ? end : null,
        content: body,
        hint: hints.join("；") || undefined,
      },
      summary:
        truncated
          ? `已读取 ${section}（全文约 ${chars} 字，本窗 ${start}-${end}/${totalLen}${hints.length ? `；${hints[0]}` : ""}）`
          : `已读取 ${section}（约 ${chars} 字，完整）`,
    };
  },
};

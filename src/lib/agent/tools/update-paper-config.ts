import type { PaperConfigRecord } from "@/contracts/paper-passport";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { updateProjectPaperPassportConfig } from "@/lib/project-paper-passport-sync";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

const STYLES = new Set(["gbt7714", "vancouver", "apa7", "ieee"]);

/**
 * Phase 0：更新论文配置（可与已有配置合并；缺字段会沿用旧值或合理默认）。
 */
export const updatePaperConfigTool: ToolDefinition = {
  name: "update_paper_config",
  description:
    "更新 PaperPassport 配置（题目、综述/研究、语言、引用格式、目标期刊、词数）。用户确认题目/体例后调用；会同步写回 Project 元数据",
  parameters: {
    type: "object",
    properties: {
      paperTitle: { type: "string", description: "论文标题" },
      paperType: {
        type: "string",
        description: "review=综述，research=研究型",
        enum: ["review", "research"],
      },
      language: {
        type: "string",
        description: "正文语言",
        enum: ["zh", "en"],
      },
      citationStyle: {
        type: "string",
        description: "引用格式",
        enum: ["gbt7714", "vancouver", "apa7", "ieee"],
      },
      targetJournal: { type: "string", description: "目标期刊（可空字符串）" },
      wordCount: { type: "string", description: "目标词数/字数说明，如 8000" },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "update_paper_config 需要绑定 projectId" };
    }

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: {
        title: true,
        mode: true,
        language: true,
        citationStyle: true,
        paperPassport: true,
      },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const prev = parsePaperPassport(project.paperPassport)?.config;
    const styleRaw = String(params.citationStyle ?? prev?.citationStyle ?? project.citationStyle ?? "gbt7714");
    const citationStyle = (
      STYLES.has(styleRaw) ? styleRaw : "gbt7714"
    ) as PaperConfigRecord["citationStyle"];

    const paperTypeRaw = String(params.paperType ?? prev?.paperType ?? project.mode ?? "research");
    const paperType: PaperConfigRecord["paperType"] =
      paperTypeRaw === "review" ? "review" : "research";

    const languageRaw = String(params.language ?? prev?.language ?? project.language ?? "zh");
    const language: PaperConfigRecord["language"] = languageRaw === "en" ? "en" : "zh";

    const config: PaperConfigRecord = {
      paperTitle:
        String(params.paperTitle ?? prev?.paperTitle ?? project.title).trim() || project.title,
      paperType,
      language,
      citationStyle,
      targetJournal:
        params.targetJournal !== undefined
          ? String(params.targetJournal)
          : (prev?.targetJournal ?? ""),
      wordCount:
        String(params.wordCount ?? prev?.wordCount ?? "").trim() || "未定",
    };

    if (!config.paperTitle.trim()) {
      return { success: false, error: "paperTitle 不能为空" };
    }

    const passport = await updateProjectPaperPassportConfig(ctx.projectId, config);
    if (!passport) {
      return { success: false, error: "写入配置失败" };
    }

    return {
      success: true,
      data: {
        config: passport.config,
        currentPhase: passport.currentPhase,
      },
      summary: `已更新配置：${config.paperTitle}（${config.paperType}/${config.language}/${config.citationStyle}）`,
    };
  },
};

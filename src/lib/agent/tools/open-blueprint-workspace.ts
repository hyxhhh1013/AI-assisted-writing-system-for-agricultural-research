import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 用户在对话里说「看看蓝图 / 打开蓝图 / 编辑蓝图」时，Agent 调用此工具。
 * 前端收到该工具的 observation 后会自动打开蓝图工作台（BlueprintWorkspaceDialog）供查看/编辑。
 */
export const openBlueprintWorkspaceTool: ToolDefinition = {
  name: "open_blueprint_workspace",
  description:
    "用户想看或编辑「写作蓝图」时调用：前端会打开蓝图工作台供其查看/编辑。"
    + "若蓝图尚未生成，先 generate_writing_blueprint 生成后再调用；不要自行把蓝图内容贴成长文。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  safety: "read",
  async execute(_params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "open_blueprint_workspace 需要关联 projectId" };
    }
    const raw = await readWritingBlueprint(ctx.projectId);
    if (!raw?.trim()) {
      return {
        success: false,
        error: "写作蓝图尚未生成，请先 generate_writing_blueprint 生成后再打开",
      };
    }
    return {
      success: true,
      summary: "已打开写作蓝图工作台，用户可查看/编辑；编辑保存后按蓝图继续。",
    };
  },
};

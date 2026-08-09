/**
 * 【已弃用】独立论证蓝图已并入 WritingBlueprint.sectionGuides（claim / evidenceHint / warrant / rebuttal）。
 * 保留工具名以免旧会话/计划硬崩；执行时引导改用 generate_writing_blueprint。
 */

import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const buildArgumentBlueprintTool: ToolDefinition = {
  name: "build_argument_blueprint",
  description:
    "【已弃用】论证已并入写作蓝图各节 claim/evidenceHint/warrant。请改用 generate_writing_blueprint 或 open_blueprint_workspace，勿再单独生成论证蓝图。",
  parameters: {
    type: "object",
    properties: {
      thesisHint: {
        type: "string",
        description: "已忽略（弃用）",
      },
      persistToProject: {
        type: "string",
        description: "已忽略（弃用）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(_params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "需要关联 projectId" };
    }
    return {
      success: false,
      error:
        "论证已并入写作蓝图，无需 build_argument_blueprint。"
        + "请调用 generate_writing_blueprint（生成含主张/证据的各节指导），"
        + "或 open_blueprint_workspace 编辑后 write_section。",
      data: {
        deprecated: true,
        useTool: "generate_writing_blueprint",
      },
    };
  },
};

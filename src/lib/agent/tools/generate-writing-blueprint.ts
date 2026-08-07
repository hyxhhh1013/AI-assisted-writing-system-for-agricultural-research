import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { computeOutlineHash } from "@/lib/blueprint-utils";
import { buildBlueprintPrompt } from "@/lib/prompts/blueprint";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { writeWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import { writingBlueprintPayloadSchema } from "@/lib/validations";

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("无法解析写作蓝图 JSON");
  }
}

/**
 * Phase 2 收尾：写作蓝图（词数分配 / 图表计划 / 各节要点）。
 * 与 academic-paper structure 阶段的 evidence map / word allocation 对齐。
 */
export const generateWritingBlueprintTool: ToolDefinition = {
  name: "generate_writing_blueprint",
  description:
    "基于项目大纲生成写作蓝图（叙事摘要、词数、图表计划、分节指导）并写回；完成 Passport Phase 2",
  parameters: {
    type: "object",
    properties: {
      persistToProject: {
        type: "string",
        description: "是否写回项目（默认 true）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_writing_blueprint 需要 projectId" };
    }

    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }
    if (!project.outline?.trim() || project.outline.trim().length < 20) {
      return {
        success: false,
        error: "请先调用 generate_outline 生成大纲，再生成写作蓝图",
      };
    }

    const persist =
      params.persistToProject === undefined
      || params.persistToProject === true
      || params.persistToProject === "true"
      || params.persistToProject === "1";

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) return { success: false, error: keyError };

    const systemPrompt = buildBlueprintPrompt({
      title: project.title,
      researchDirection: project.researchDirection || project.title,
      outline: project.outline,
      language: project.language,
      projectMode: project.mode,
    });

    const response = await callAI({
      provider,
      messages: [
        {
          role: "system",
          content:
            "你是学术论文规划助手。严格只输出 JSON 对象，不要 markdown 围栏或解释文字。generatedAt 填 0 即可。",
        },
        { role: "user", content: systemPrompt },
      ],
      stream: false,
      timeoutMs: 120_000,
      signal: ctx.signal,
      userId: ctx.userId,
    });

    const rawJson = await response.json();
    const rawText: string = rawJson?.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) {
      return { success: false, error: "AI 未返回写作蓝图" };
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(rawText);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "JSON 解析失败",
      };
    }

    const checked = writingBlueprintPayloadSchema.safeParse(parsed);
    if (!checked.success) {
      return { success: false, error: "写作蓝图结构无效" };
    }

    const totalMin = Math.max(checked.data.figurePlan.totalMin, 0);
    const items = checked.data.figurePlan.items.map((item, index) => ({
      ...item,
      id: item.id?.trim() || `fig-${index + 1}`,
    }));
    const blueprint: WritingBlueprint = {
      ...checked.data,
      version: 1,
      projectMode:
        checked.data.projectMode
        ?? (project.mode === "research" ? "research" : "review"),
      language: checked.data.language ?? project.language,
      outlineHash: computeOutlineHash(project.outline),
      generatedAt: Date.now(),
      figurePlan: {
        totalMin,
        totalMax: Math.max(checked.data.figurePlan.totalMax, totalMin),
        items,
      },
    };

    if (persist) {
      await writeWritingBlueprint(ctx.projectId, JSON.stringify(blueprint));
      try {
        await syncProjectPaperPassport(ctx.projectId);
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      data: {
        thesis: blueprint.thesis.slice(0, 240),
        wordRange: blueprint.estimatedWordCount,
        sectionGuideCount: blueprint.sectionGuides.length,
        figureItems: blueprint.figurePlan.items.length,
        persisted: persist,
      },
      summary: persist
        ? `已写回写作蓝图：${blueprint.sectionGuides.length} 节指导，图表计划 ${blueprint.figurePlan.items.length} 项`
        : `已生成写作蓝图预览（未写回）`,
    };
  },
};

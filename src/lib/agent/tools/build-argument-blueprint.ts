import {
  parseArgumentBlueprint,
  serializeArgumentBlueprint,
} from "@/contracts/argument-blueprint";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { buildArgumentBlueprintPrompt } from "@/lib/prompts/argument-blueprint";
import { computeOutlineHash } from "@/lib/blueprint-utils";
import {
  readArgumentBlueprint,
  writeArgumentBlueprint,
} from "@/lib/project-argument-blueprint-db";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { argumentBlueprintPayloadSchema } from "@/lib/validations";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";

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
    throw new Error("无法解析论证蓝图 JSON");
  }
}

export const buildArgumentBlueprintTool: ToolDefinition = {
  name: "build_argument_blueprint",
  description:
    "基于项目大纲生成论证蓝图（主张—证据—推理链 + 反驳），并写回项目；对应 Passport Phase 3",
  parameters: {
    type: "object",
    properties: {
      thesisHint: {
        type: "string",
        description: "可选：中心论点提示",
      },
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
      return { success: false, error: "build_argument_blueprint 需要 projectId" };
    }

    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }
    if (!project.outline?.trim() || project.outline.trim().length < 20) {
      return { success: false, error: "请先生成大纲再构建论证蓝图" };
    }

    const persist =
      params.persistToProject === undefined
      || params.persistToProject === true
      || params.persistToProject === "true"
      || params.persistToProject === "1";

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) return { success: false, error: keyError };

    const existing = parseArgumentBlueprint(
      await readArgumentBlueprint(ctx.projectId),
    );

    const systemPrompt = buildArgumentBlueprintPrompt({
      title: project.title,
      researchDirection: project.researchDirection || project.title,
      outline: project.outline,
      language: project.language,
      projectMode: project.mode,
      thesisHint: params.thesisHint
        ? String(params.thesisHint)
        : existing?.centralThesis,
    });

    const response = await callAI({
      provider,
      messages: [
        {
          role: "system",
          content: "你是学术论证顾问。严格只输出 JSON 对象，不要 markdown 围栏。",
        },
        { role: "user", content: systemPrompt },
      ],
      stream: false,
      signal: ctx.signal,
      userId: ctx.userId,
    });

    const rawJson = await response.json();
    const rawText: string = rawJson?.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) {
      return { success: false, error: "AI 未返回论证蓝图" };
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

    const checked = argumentBlueprintPayloadSchema.safeParse(parsed);
    if (!checked.success) {
      return { success: false, error: "论证蓝图结构无效" };
    }

    const blueprint: ArgumentBlueprint = {
      ...checked.data,
      version: 1,
      chains: checked.data.chains.map((c, i) => ({
        ...c,
        id: c.id?.trim() || `c${i + 1}`,
      })),
      rebuttals: checked.data.rebuttals.map((r, i) => ({
        ...r,
        id: r.id?.trim() || `r${i + 1}`,
      })),
      gaps: checked.data.gaps ?? [],
      outlineHash: computeOutlineHash(project.outline),
      generatedAt: Date.now(),
    };

    if (persist) {
      await writeArgumentBlueprint(
        ctx.projectId,
        serializeArgumentBlueprint(blueprint),
      );
      try {
        await syncProjectPaperPassport(ctx.projectId);
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      data: {
        centralThesis: blueprint.centralThesis,
        chainCount: blueprint.chains.length,
        rebuttalCount: blueprint.rebuttals.length,
        gapCount: blueprint.gaps.length,
        persisted: persist,
      },
      summary: persist
        ? `已生成并写回论证蓝图（${blueprint.chains.length} 条主张链）`
        : `已生成论证蓝图（${blueprint.chains.length} 条主张链，未写回）`,
    };
  },
};

import type { BilingualAbstract } from "@/contracts/bilingual-abstract";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { buildBilingualAbstractPrompt } from "@/lib/prompts/bilingual-abstract";
import {
  bilingualAbstractPayloadSchema,
} from "@/lib/validations";
import {
  buildAbstractSourceBody,
  hasSubstantialBodySections,
  stripInlineCitations,
} from "@/lib/abstract-utils";
import { persistBilingualAbstract } from "@/lib/project-bilingual-abstract";
import prisma from "@/lib/prisma";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

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
    throw new Error("无法解析双语摘要 JSON");
  }
}

export const writeBilingualAbstractTool: ToolDefinition = {
  name: "write_bilingual_abstract",
  description:
    "基于已写正文生成中英双语摘要：主语言写入项目摘要，对照语言写入 Passport（Phase 5b）",
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
      return { success: false, error: "write_bilingual_abstract 需要 projectId" };
    }

    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const db = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      include: { sections: true },
    });
    if (!db) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const sections = Object.fromEntries(
      db.sections.map((s) => [s.key, s.content || ""]),
    );
    if (!hasSubstantialBodySections(sections)) {
      return {
        success: false,
        error: "正文不足，请先写完主要章节再生成双语摘要",
      };
    }

    const persist =
      params.persistToProject === undefined
      || params.persistToProject === true
      || params.persistToProject === "true"
      || params.persistToProject === "1";

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) return { success: false, error: keyError };

    const bodyText = buildAbstractSourceBody(sections);
    const prompt = buildBilingualAbstractPrompt({
      title: project.title,
      projectMode: project.mode,
      bodyText,
      primaryLanguage: project.language,
    });

    const response = await callAI({
      provider,
      messages: [
        {
          role: "system",
          content: "你是学术摘要写作者。严格只输出 JSON 对象，不要 markdown 围栏。",
        },
        { role: "user", content: prompt },
      ],
      stream: false,
      signal: ctx.signal,
      userId: ctx.userId,
    });

    const rawJson = await response.json();
    const rawText: string = rawJson?.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) {
      return { success: false, error: "AI 未返回双语摘要" };
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

    const checked = bilingualAbstractPayloadSchema.safeParse(parsed);
    if (!checked.success) {
      return { success: false, error: "双语摘要结构无效" };
    }

    const bilingual: BilingualAbstract = {
      version: 1,
      zh: stripInlineCitations(checked.data.zh),
      en: stripInlineCitations(checked.data.en),
      generatedAt: Date.now(),
    };

    if (persist) {
      await persistBilingualAbstract(ctx.projectId, bilingual, project.language);
    }

    return {
      success: true,
      data: {
        section: "abstract",
        zhChars: bilingual.zh.replace(/\s+/g, "").length,
        enChars: bilingual.en.replace(/\s+/g, "").length,
        persisted: persist,
        draft: `中文摘要：\n${bilingual.zh}\n\n英文摘要：\n${bilingual.en}`,
      },
      summary: persist
        ? `已生成并写回双语摘要（中文约 ${bilingual.zh.replace(/\s+/g, "").length} 字）`
        : `已生成双语摘要（未写回）`,
    };
  },
};

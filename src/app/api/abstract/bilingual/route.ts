import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { callAI, getAgentModelConfig } from "@/lib/ai";
import { validateBody } from "@/lib/api-validate";
import { getErrorMessage } from "@/lib/error-utils";
import {
  bilingualAbstractPayloadSchema,
  bilingualAbstractSchema,
} from "@/lib/validations";
import { buildBilingualAbstractPrompt } from "@/lib/prompts/bilingual-abstract";
import {
  buildAbstractSourceBody,
  hasSubstantialBodySections,
  stripInlineCitations,
} from "@/lib/abstract-utils";
import type { BilingualAbstract } from "@/contracts/bilingual-abstract";
import { persistBilingualAbstract } from "@/lib/project-bilingual-abstract";
import { getUserIdFromRequest } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

/** POST /api/abstract/bilingual — Phase 5b 中英双语摘要 */
export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(
      bilingualAbstractSchema,
      await req.json(),
    );
    if (ve) return ve;

    const {
      title,
      projectId,
      sections,
      bodyText,
      projectMode,
      primaryLanguage,
      persistToProject,
    } = data;

    let resolvedSections = sections ?? {};
    let resolvedTitle = title;
    let resolvedMode = projectMode ?? "review";
    let resolvedLang = primaryLanguage ?? "zh";

    if (projectId) {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return NextResponse.json({ error: "未登录" }, { status: 401 });
      }
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: { sections: true },
      });
      if (!project) {
        return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
      }
      resolvedTitle = project.title || title;
      resolvedMode = project.mode === "research" ? "research" : "review";
      // 请求显式传 primaryLanguage 时优先生效（避免对话框未保存语言被 DB 覆盖）
      resolvedLang =
        primaryLanguage
        ?? (project.language === "en" ? "en" : "zh");
      if (!sections || Object.keys(sections).length === 0) {
        resolvedSections = Object.fromEntries(
          project.sections.map((s) => [s.key, s.content || ""]),
        );
      }
    } else if (primaryLanguage) {
      resolvedLang = primaryLanguage;
    }

    const sourceBody =
      (bodyText?.trim()
        ? stripInlineCitations(bodyText)
        : buildAbstractSourceBody(resolvedSections)) || "";

    if (!hasSubstantialBodySections(resolvedSections) && sourceBody.replace(/\s+/g, "").length < 80) {
      return NextResponse.json(
        { error: "正文不足，请先写完主要章节再生成双语摘要" },
        { status: 400 },
      );
    }

    const { provider, keyError } = getAgentModelConfig("writer");
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 503 });
    }

    const prompt = buildBilingualAbstractPrompt({
      title: resolvedTitle,
      projectMode: resolvedMode,
      bodyText: sourceBody,
      primaryLanguage: resolvedLang,
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
    });

    const rawJson = await response.json();
    const rawText: string = rawJson?.choices?.[0]?.message?.content || "";
    if (!rawText.trim()) {
      return NextResponse.json({ error: "AI 未返回摘要" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(rawText);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "JSON 解析失败" },
        { status: 502 },
      );
    }

    const checked = bilingualAbstractPayloadSchema.safeParse(parsed);
    if (!checked.success) {
      return NextResponse.json({ error: "双语摘要结构无效" }, { status: 502 });
    }

    const bilingual: BilingualAbstract = {
      version: 1,
      zh: stripInlineCitations(checked.data.zh),
      en: stripInlineCitations(checked.data.en),
      generatedAt: Date.now(),
    };

    if (persistToProject && projectId) {
      await persistBilingualAbstract(projectId, bilingual, resolvedLang);
    }

    return NextResponse.json(bilingual);
  } catch (error) {
    logger.error("bilingual abstract failed", { error: getErrorMessage(error) });
    return NextResponse.json(
      { error: getErrorMessage(error) || "双语摘要生成失败" },
      { status: 500 },
    );
  }
}

import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unauthorizedResponse, notFoundResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/lib/api-validate";
import { projectEvidencePatchSchema } from "@/lib/validations";
import type { ProjectDTO } from "@/contracts/project";
import {
  parseExpandedOutlineSections,
  serializeExpandedOutlineSections,
} from "@/contracts/project";
import { getErrorMessage } from "@/lib/error-utils";
import type { Prisma } from "@prisma/client";

import { getCoreSectionKeysForMode } from "@/lib/section-registry";
import {
  readWritingBlueprint,
  writeWritingBlueprint,
} from "@/lib/project-writing-blueprint-db";
import {
  parsePaperPassport,
  serializePaperPassport,
} from "@/contracts/paper-passport";
import { syncProjectPaperPassport, savePaperPassportForProject } from "@/lib/project-paper-passport-sync";

type SectionRecord = Record<string, string>;

function normalizePaperPassportInput(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw === "string") {
    const parsed = parsePaperPassport(raw);
    if (!parsed) throw new Error("paperPassport 格式无效");
    return serializePaperPassport(parsed);
  }
  if (typeof raw === "object" && raw !== null) {
    const parsed = parsePaperPassport(JSON.stringify(raw));
    if (!parsed) throw new Error("paperPassport 格式无效");
    return serializePaperPassport(parsed);
  }
  throw new Error("paperPassport 格式无效");
}

// 获取当前用户的 userId（由 middleware.ts 设置 header）
function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id") || null;
}

// 获取所有项目（仅当前用户）
export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const project = await prisma.project.findFirst({
        where: { id, userId },
        include: {
          sections: true,
          references: true,
          analysisResults: true,
        },
      });

      if (!project) {
        return notFoundResponse("项目未找到");
      }

      let paperPassportRaw: string | undefined;
      try {
        const synced = await syncProjectPaperPassport(project.id);
        if (synced) paperPassportRaw = serializePaperPassport(synced);
      } catch (passportError: unknown) {
        logger.warn("Paper-passport sync skipped on GET project", passportError);
      }

      const langRaw = (project as { language?: string | null }).language;
      const formattedProject = {
        ...project,
        lastUpdated: project.lastUpdated.getTime(),
        sections: project.sections.reduce<SectionRecord>((acc, s) => {
          acc[s.key] = s.content;
          return acc;
        }, {}),
        references: project.references
          .sort((a, b) => a.order - b.order)
          .map(r => r.content),
        analysisResults: project.analysisResults.map(r => r.content),
        mode: project.mode || "review",
        language: langRaw === "en" ? "en" : "zh",
        citationStyle: (project.citationStyle as ProjectDTO["citationStyle"]) || "gbt7714",
        dataClaims: project.dataClaims || undefined,
        dataSources: project.dataSources || undefined,
        writingBlueprint: (await readWritingBlueprint(project.id)) || undefined,
        paperPassport: paperPassportRaw || undefined,
        expandedOutlineSections: parseExpandedOutlineSections(project.expandedOutlineSections),
      };

      return NextResponse.json(formattedProject);
    }

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { lastUpdated: 'desc' },
      select: {
        id: true,
        title: true,
        mode: true,
        lastUpdated: true,
        sections: { select: { key: true, content: true } },
      }
    });

    return NextResponse.json(projects.map(p => {
      const filledCount = p.sections.filter(s => s.content && s.content.trim().length > 10).length;
      const mode = p.mode === "research" ? "research" : "review";
      const coreKeys = getCoreSectionKeysForMode(mode);
      const coreFilled = p.sections.filter(
        s => coreKeys.includes(s.key) && s.content && s.content.trim().length > 10,
      ).length;
      const progress = Math.round((coreFilled / coreKeys.length) * 100);
      return {
        id: p.id,
        title: p.title,
        mode,
        lastUpdated: p.lastUpdated.getTime(),
        progress,
        sectionCount: p.sections.length,
        filledCount,
      };
    }));
  } catch (error: unknown) {
    logger.error("Projects GET error:", error);
    return errorResponse(error instanceof Error ? getErrorMessage(error) : "Projects GET failed");
  }
}

// 创建或更新项目
export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return unauthorizedResponse();
    }

    const data = await req.json();
    const {
      id,
      title,
      authors,
      affiliations,
      abstract,
      keywords,
      classification,
      researchDirection,
      outline,
      template,
      mode,
      language,
      citationStyle,
      sections,
      references: _legacyReferences,
      analysisResults: _legacyAnalysisResults,
      dataClaims,
      dataSources,
      expandedOutlineSections,
      writingBlueprint,
      paperPassport: paperPassportRaw,
    } = data;

    if (!title) {
      return errorResponse("标题不能为空", 400);
    }

    // 校验所有权（仅更新时）
    const projectId = id || undefined;
    if (projectId) {
      const existing = await prisma.project.findFirst({
        where: { id: projectId, userId },
        select: { id: true },
      });
      if (!existing) {
        return notFoundResponse("项目未找到");
      }
    }

    const paperPassportJson = normalizePaperPassportInput(paperPassportRaw);

    const project = await prisma.$transaction(
      async (tx) => {
      const saved = projectId
        ? await tx.project.update({
            where: { id: projectId },
            data: {
              title, authors, affiliations, abstract, keywords,
              classification, researchDirection, outline, template, citationStyle,
              ...(language !== undefined
                ? { language: language === "en" ? "en" : "zh" }
                : {}),
              dataClaims, dataSources,
              ...(expandedOutlineSections !== undefined
                ? {
                    expandedOutlineSections: serializeExpandedOutlineSections(
                      Array.isArray(expandedOutlineSections) ? expandedOutlineSections : [],
                    ),
                  }
                : {}),
              lastUpdated: new Date(),
            } as Prisma.ProjectUpdateInput,
          })
        : await tx.project.create({
            data: {
              userId, title, authors, affiliations, abstract, keywords,
              classification, researchDirection, outline, template,
              mode: mode === "research" ? "research" : "review",
              language: language === "en" ? "en" : "zh",
              citationStyle,
              dataClaims, dataSources,
              expandedOutlineSections: serializeExpandedOutlineSections(
                Array.isArray(expandedOutlineSections) ? expandedOutlineSections : [],
              ),
            } as Prisma.ProjectUncheckedCreateInput,
          });

      const nextProjectId = saved.id;

      if (sections) {
        for (const [key, content] of Object.entries(sections)) {
          await tx.section.upsert({
            where: { projectId_key: { projectId: nextProjectId, key } },
            update: { content: content as string },
            create: { projectId: nextProjectId, key, content: content as string },
          });
        }
      }

      void _legacyReferences;
      void _legacyAnalysisResults;

      return saved;
    },
      { timeout: 15_000 },
    );

    if (writingBlueprint !== undefined) {
      await writeWritingBlueprint(
        project.id,
        writingBlueprint === null || writingBlueprint === "" ? null : writingBlueprint,
      );
    }

    if (paperPassportJson !== undefined && paperPassportJson !== null) {
      try {
        await savePaperPassportForProject(project.id, paperPassportJson);
      } catch (passportError: unknown) {
        logger.warn("Paper-passport persist skipped on POST project", passportError);
      }
    }

    try {
      await syncProjectPaperPassport(project.id);
    } catch (passportError: unknown) {
      logger.warn("Paper-passport sync skipped on POST project", passportError);
    }

    return NextResponse.json({ id: project.id, message: "保存成功" });
  } catch (error: unknown) {
    logger.error("Projects POST error:", error);
    const message = error instanceof Error ? getErrorMessage(error) : "Projects POST failed";
    if (message.includes("paperPassport")) {
      return errorResponse(message, 400);
    }
    return errorResponse(message);
  }
}

// 增量 PATCH：仅更新 dataClaims / dataSources
export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return errorResponse("未指定项目ID", 400);
    }

    const existing = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      return notFoundResponse("项目未找到");
    }

    const { data, errorResponse: ve } = await validateBody(
      projectEvidencePatchSchema,
      await req.json(),
    );
    if (ve) return ve;

    await prisma.project.update({
      where: { id },
      data: {
        ...(data.dataClaims !== undefined ? { dataClaims: data.dataClaims } : {}),
        ...(data.dataSources !== undefined ? { dataSources: data.dataSources } : {}),
        lastUpdated: new Date(),
      },
    });

    return NextResponse.json({ message: "更新成功" });
  } catch (error: unknown) {
    logger.error("Projects PATCH error:", error);
    return errorResponse(error instanceof Error ? getErrorMessage(error) : "Projects PATCH failed");
  }
}

// 删除项目
export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return errorResponse("未指定项目ID", 400);
    }

    const existing = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      return notFoundResponse("项目未找到");
    }

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ message: "删除成功" });
  } catch (error: unknown) {
    logger.error("Projects DELETE error:", error);
    return errorResponse(error instanceof Error ? getErrorMessage(error) : "Projects DELETE failed");
  }
}

import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unauthorizedResponse, notFoundResponse, errorResponse } from "@/lib/api-response";
import { validateBody } from "@/lib/api-validate";
import { projectEvidencePatchSchema } from "@/lib/validations";
import type { ProjectDTO } from "@/contracts/project";
import { getErrorMessage } from "@/lib/error-utils";

import { getCoreSectionKeysForMode } from "@/lib/section-registry";

type SectionRecord = Record<string, string>;

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
        citationStyle: (project.citationStyle as ProjectDTO["citationStyle"]) || "gbt7714",
        dataClaims: project.dataClaims || undefined,
        dataSources: project.dataSources || undefined,
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
      citationStyle,
      sections,
      references,
      analysisResults,
      dataClaims,
      dataSources,
    } = data;

    if (!title) {
      return errorResponse("标题不能为空", 400);
    }

    // 校验所有权（仅更新时）
    let projectId = id || undefined;
    if (projectId) {
      const existing = await prisma.project.findFirst({
        where: { id: projectId, userId },
        select: { id: true },
      });
      if (!existing) {
        return notFoundResponse("项目未找到");
      }
    }

    // 创建或更新主记录（mode 仅在新建时写入，更新时不允许切换类型）
    const project = projectId
      ? await prisma.project.update({
          where: { id: projectId },
          data: {
            title, authors, affiliations, abstract, keywords,
            classification, researchDirection, outline, template, citationStyle,
            dataClaims, dataSources,
            lastUpdated: new Date(),
          },
        })
      : await prisma.project.create({
          data: {
            userId, title, authors, affiliations, abstract, keywords,
            classification, researchDirection, outline, template,
            mode: mode === "research" ? "research" : "review",
            citationStyle,
            dataClaims, dataSources,
          },
        });

    projectId = project.id;

    // 增量保存 sections（逐条 upsert，不 deleteMany）
    if (sections) {
      for (const [key, content] of Object.entries(sections)) {
        await prisma.section.upsert({
          where: { projectId_key: { projectId, key } },
          update: { content: content as string },
          create: { projectId, key, content: content as string },
        });
      }
    }

    // 增量保存 references（删除旧+插入新，保持顺序）
    if (references !== undefined) {
      await prisma.reference.deleteMany({ where: { projectId } });
      for (let i = 0; i < references.length; i++) {
        await prisma.reference.create({
          data: { projectId, content: references[i], order: i },
        });
      }
    }

    // 增量保存 analysisResults
    if (analysisResults !== undefined) {
      await prisma.analysisResult.deleteMany({ where: { projectId } });
      for (const content of analysisResults) {
        await prisma.analysisResult.create({
          data: { projectId, content },
        });
      }
    }

    return NextResponse.json({ id: project.id, message: "保存成功" });
  } catch (error: unknown) {
    logger.error("Projects POST error:", error);
    return errorResponse(error instanceof Error ? getErrorMessage(error) : "Projects POST failed");
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

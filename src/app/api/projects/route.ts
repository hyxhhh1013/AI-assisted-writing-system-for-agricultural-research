import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unauthorizedResponse, notFoundResponse, errorResponse } from "@/lib/api-response";

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
        dataClaims: project.dataClaims || undefined,
        dataSources: project.dataSources || undefined,
      };

      return NextResponse.json(formattedProject);
    }

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { lastUpdated: 'desc' },
      select: { id: true, title: true, lastUpdated: true }
    });

    return NextResponse.json(projects.map(p => ({
      ...p,
      lastUpdated: p.lastUpdated.getTime()
    })));
  } catch (error: unknown) {
    console.error("Projects GET error:", error);
    return errorResponse(error instanceof Error ? error.message : "Projects GET failed");
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

    // 创建或更新主记录
    const project = projectId
      ? await prisma.project.update({
          where: { id: projectId },
          data: {
            title, authors, affiliations, abstract, keywords,
            classification, researchDirection, outline, template, mode,
            dataClaims, dataSources,
            lastUpdated: new Date(),
          },
        })
      : await prisma.project.create({
          data: {
            userId, title, authors, affiliations, abstract, keywords,
            classification, researchDirection, outline, template, mode,
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
    console.error("Projects POST error:", error);
    return errorResponse(error instanceof Error ? error.message : "Projects POST failed");
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
    console.error("Projects DELETE error:", error);
    return errorResponse(error instanceof Error ? error.message : "Projects DELETE failed");
  }
}

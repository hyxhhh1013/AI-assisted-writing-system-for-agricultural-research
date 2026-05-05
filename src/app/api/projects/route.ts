import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type SectionRecord = Record<string, string>;

// 获取所有项目
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          sections: true,
          references: true,
          analysisResults: true,
        },
      });

      if (!project) {
        return NextResponse.json({ error: "项目未找到" }, { status: 404 });
      }

      // 格式化输出以匹配前端原本的 ProjectData 结构
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
      };

      return NextResponse.json(formattedProject);
    }

    const projects = await prisma.project.findMany({
      orderBy: { lastUpdated: 'desc' },
      select: { id: true, title: true, lastUpdated: true }
    });

    return NextResponse.json(projects.map(p => ({
      ...p,
      lastUpdated: p.lastUpdated.getTime()
    })));
  } catch (error: unknown) {
    console.error("Projects GET error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Projects GET failed" }, { status: 500 });
  }
}

// 创建或更新项目
export async function POST(req: NextRequest) {
  try {
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
      sections,
      references,
      analysisResults,
    } = data;

    if (!title) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }

    // upsert 逻辑
    const project = await prisma.project.upsert({
      where: { id: id || 'new-id' },
      update: {
        title,
        authors,
        affiliations,
        abstract,
        keywords,
        classification,
        researchDirection,
        outline,
        template,
        lastUpdated: new Date(),
        // 处理关联数据（先删除后创建以保持同步，或者使用更精细的逻辑）
        sections: {
          deleteMany: {},
          create: Object.entries(sections || {}).map(([key, content]) => ({
            key,
            content: content as string,
          })),
        },
        references: {
          deleteMany: {},
          create: (references || []).map((content: string, index: number) => ({
            content,
            order: index,
          })),
        },
        analysisResults: {
          deleteMany: {},
          create: (analysisResults || []).map((content: string) => ({
            content,
          })),
        },
      },
      create: {
        id: id || undefined,
        title,
        authors,
        affiliations,
        abstract,
        keywords,
        classification,
        researchDirection,
        outline,
        template,
        sections: {
          create: Object.entries(sections || {}).map(([key, content]) => ({
            key,
            content: content as string,
          })),
        },
        references: {
          create: (references || []).map((content: string, index: number) => ({
            content,
            order: index,
          })),
        },
        analysisResults: {
          create: (analysisResults || []).map((content: string) => ({
            content,
          })),
        },
      },
    });

    return NextResponse.json({ id: project.id, message: "保存成功" });
  } catch (error: unknown) {
    console.error("Projects POST error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Projects POST failed" }, { status: 500 });
  }
}

// 删除项目
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "未指定项目ID" }, { status: 400 });
    }

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ message: "删除成功" });
  } catch (error: unknown) {
    console.error("Projects DELETE error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Projects DELETE failed" }, { status: 500 });
  }
}

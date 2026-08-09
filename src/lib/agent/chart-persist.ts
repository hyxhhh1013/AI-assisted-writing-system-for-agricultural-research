import type { ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts } from "@/contracts/figure";
import {
  replaceMarkdownImageUrl,
  stripMarkdownImagesByUrl,
} from "@/lib/agent/chart-markdown";
import { applyChartPatchOps } from "@/lib/project-charts";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import prisma from "@/lib/prisma";

/** Agent generate_chart：追加图表资产到 Project.charts */
export async function persistAgentChart(
  userId: string,
  projectId: string,
  asset: Omit<ProjectChartAsset, "id" | "createdAt">,
): Promise<ProjectChartAsset> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const assets = await applyChartPatchOps(projectId, [{ op: "append", asset }]);
  const created = assets[assets.length - 1];
  if (!created) {
    throw new Error("图表资产写入失败");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });

  return created;
}

async function assertOwned(userId: string, projectId: string): Promise<void> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }
}

/** 读取项目图表资产列表（供防叠图 / 工具内定位） */
export async function listAgentCharts(
  projectId: string,
): Promise<ProjectChartAsset[]> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { charts: true },
  });
  return parseProjectCharts(row?.charts);
}

async function loadCharts(
  projectId: string,
): Promise<ProjectChartAsset[]> {
  return listAgentCharts(projectId);
}

function findChart(
  charts: ProjectChartAsset[],
  opts: { chartId?: string; imageUrl?: string },
): ProjectChartAsset | null {
  const id = opts.chartId?.trim();
  const url = opts.imageUrl?.trim();
  if (id) {
    return charts.find((c) => c.id === id) ?? null;
  }
  if (url) {
    // 同 URL 可能有多条时取最新
    const hits = charts.filter((c) => c.imageUrl === url);
    return hits[hits.length - 1] ?? null;
  }
  return null;
}

async function writeSectionContent(
  projectId: string,
  sectionKey: string,
  content: string,
): Promise<void> {
  if (sectionKey === "abstract") {
    await prisma.project.update({
      where: { id: projectId },
      data: { abstract: content, lastUpdated: new Date() },
    });
    return;
  }
  await prisma.section.upsert({
    where: { projectId_key: { projectId, key: sectionKey } },
    update: { content },
    create: { projectId, key: sectionKey, content },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });
}

async function readSectionContent(
  projectId: string,
  sectionKey: string,
): Promise<string> {
  if (sectionKey === "abstract") {
    const row = await prisma.project.findUnique({
      where: { id: projectId },
      select: { abstract: true },
    });
    return row?.abstract ?? "";
  }
  const row = await prisma.section.findUnique({
    where: { projectId_key: { projectId, key: sectionKey } },
    select: { content: true },
  });
  return row?.content ?? "";
}

/**
 * 删除图表资产；可选同步从章节正文去掉对应 Markdown 图片。
 * 用于「改图」前清旧图，或用户明确要求删图。
 */
export async function removeAgentChart(
  userId: string,
  projectId: string,
  opts: {
    chartId?: string;
    imageUrl?: string;
    /** 默认 true：从资产关联章节（及扫描到的章节）去掉 Markdown 引用 */
    stripFromBody?: boolean;
  },
): Promise<{ deleted: ProjectChartAsset; strippedFrom: string[] }> {
  await assertOwned(userId, projectId);
  const charts = await loadCharts(projectId);
  const victim = findChart(charts, opts);
  if (!victim) {
    throw new Error(
      opts.chartId
        ? `图表资产不存在: ${opts.chartId}`
        : opts.imageUrl
          ? `未找到 imageUrl=${opts.imageUrl} 的图表资产`
          : "请提供 chartId 或 imageUrl",
    );
  }

  await applyChartPatchOps(projectId, [{ op: "delete", id: victim.id }]);

  const strippedFrom: string[] = [];
  if (opts.stripFromBody !== false) {
    const keys = new Set<string>();
    if (victim.sectionKey) keys.add(victim.sectionKey);
    // 再扫一遍常见章节，防止 sectionKey 空但正文仍挂着图
    const sections = await prisma.section.findMany({
      where: { projectId },
      select: { key: true, content: true },
    });
    for (const s of sections) {
      if (s.content?.includes(victim.imageUrl)) keys.add(s.key);
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { abstract: true },
    });
    if (project?.abstract?.includes(victim.imageUrl)) keys.add("abstract");

    for (const key of keys) {
      const content = await readSectionContent(projectId, key);
      const { next, removed } = stripMarkdownImagesByUrl(content, victim.imageUrl);
      if (removed > 0) {
        await writeSectionContent(projectId, key, next);
        strippedFrom.push(key);
      }
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });
  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞 */
  }

  return { deleted: victim, strippedFrom };
}

/**
 * 将新图写入章节：若提供 replaceImageUrl 且正文有旧图 → 就地替换；否则追加。
 * 同时可退休旧图表资产（删 Project.charts 条目 + 磁盘文件）。
 */
export async function insertOrReplaceAgentSectionImage(
  userId: string,
  projectId: string,
  input: {
    sectionKey: string;
    caption: string;
    imageUrl: string;
    replaceImageUrl?: string;
    replaceChartId?: string;
  },
): Promise<{ mode: "replaced" | "appended"; retiredId?: string }> {
  await assertOwned(userId, projectId);

  const replaceUrl = input.replaceImageUrl?.trim() || "";
  const replaceId = input.replaceChartId?.trim() || "";
  let retiredId: string | undefined;
  let oldUrlForBody = replaceUrl;

  if (replaceId || replaceUrl) {
    const charts = await loadCharts(projectId);
    const victim = findChart(charts, { chartId: replaceId, imageUrl: replaceUrl });
    if (victim) {
      oldUrlForBody = victim.imageUrl;
      await applyChartPatchOps(projectId, [{ op: "delete", id: victim.id }]);
      retiredId = victim.id;
    }
  }

  const content = await readSectionContent(projectId, input.sectionKey);
  if (oldUrlForBody) {
    const { next, replaced } = replaceMarkdownImageUrl(
      content,
      oldUrlForBody,
      input.imageUrl,
      input.caption,
    );
    if (replaced > 0) {
      await writeSectionContent(projectId, input.sectionKey, next);
      try {
        await syncProjectPaperPassport(projectId);
      } catch {
        /* 不阻塞 */
      }
      return { mode: "replaced", retiredId };
    }
  }

  // 正文无旧图：追加（与历史行为一致）
  const chunk = `\n\n![${input.caption}](${input.imageUrl})\n\n`;
  await writeSectionContent(projectId, input.sectionKey, `${content}${chunk}`);
  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞 */
  }
  return { mode: "appended", retiredId };
}

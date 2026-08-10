/** 项目 API 服务封装 — 类型定义已统一到 src/contracts/project.ts */

import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import type {
  ProjectData,
  ReferencePatchOp,
  ProjectReferenceRecord,
  AnalysisResultPatchOp,
  ProjectAnalysisRecord,
} from "@/contracts/project";
import type { ChartPatchOp, ProjectChartAsset } from "@/contracts/figure";
import {
  serializeDataClaims,
  serializeDataSources,
} from "@/contracts/project";

// Re-export so existing importers of services/project don't break
export type { ProjectData, ProjectDTO } from "@/contracts/project";

export interface ProjectListItem {
  id: string;
  title: string;
  lastUpdated: number;
  /** 创建时选定的写作模式，不可在工作台切换 */
  mode: "review" | "research";
  /** 写作进度 0-100（基于核心章节完成度） */
  progress: number;
  /** 总章节数 */
  sectionCount: number;
  /** 已填写章节数 */
  filledCount: number;
}

export interface SectionRecord {
  introduction: string;
  methods: string;
  results: string;
  conclusion: string;
  [key: string]: string | undefined;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) return [];
  return res.json();
}

export async function getProject(id: string): Promise<ProjectData | null> {
  if (!id) return null;
  try {
    const res = await fetch(`/api/projects?id=${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function saveProject(data: ProjectData): Promise<string | null> {
  const { references: _refs, analysisResults: _analysis, ...payload } = data;
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const result = await res.json();
  return result.id;
}

export async function deleteProject(id: string): Promise<boolean> {
  const res = await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
  return res.ok;
}

export interface ProjectEvidenceFieldsPatch {
  dataClaims?: EvidenceClaim[];
  dataSources?: DataSourceAnalysis[];
}

/** PATCH /api/projects?id= — 仅更新 dataClaims / dataSources */
export async function patchProjectFields(
  id: string,
  fields: ProjectEvidenceFieldsPatch,
): Promise<void> {
  const body: Record<string, string> = {};
  if (fields.dataClaims !== undefined) {
    body.dataClaims = serializeDataClaims(fields.dataClaims);
  }
  if (fields.dataSources !== undefined) {
    body.dataSources = serializeDataSources(fields.dataSources);
  }

  const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存证据数据失败");
  }
}

/** PATCH /api/projects/:id/references — 参考文献增量 upsert/delete */
export async function patchReferences(
  projectId: string,
  ops: ReferencePatchOp[],
): Promise<ProjectReferenceRecord[]> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/references`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存参考文献失败");
  }
  const data = (await res.json()) as { references: ProjectReferenceRecord[] };
  return data.references;
}

/** PATCH /api/projects/:id/analysis-results — 分析结果增量 create/update/delete */
export async function patchAnalysisResults(
  projectId: string,
  ops: AnalysisResultPatchOp[],
): Promise<ProjectAnalysisRecord[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/analysis-results`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存分析结果失败");
  }
  const data = (await res.json()) as { analysisResults: ProjectAnalysisRecord[] };
  return data.analysisResults;
}

/** 整表替换参考文献（重排/清理） */
export async function replaceReferences(
  projectId: string,
  items: string[],
): Promise<ProjectReferenceRecord[]> {
  return patchReferences(projectId, [{ op: "replace", items }]);
}

/** 追加一条分析结果并返回全部 content 列表 */
export async function appendAnalysisResult(
  projectId: string,
  content: string,
): Promise<string[]> {
  const rows = await patchAnalysisResults(projectId, [{ op: "create", content }]);
  return rows.map((r) => r.content);
}

/** PATCH /api/projects/:id/sections/:key — 单章节增量保存 */
export async function patchProjectSection(
  projectId: string,
  sectionKey: string,
  content: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionKey)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存章节失败");
  }
}

/** 在章节末尾追加 Markdown（先读再 PATCH，仍只写单 section） */
export async function appendProjectSectionMarkdown(
  projectId: string,
  sectionKey: string,
  markdown: string,
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("项目未找到");
  const current = project.sections[sectionKey] ?? "";
  await patchProjectSection(projectId, sectionKey, current + markdown);
}

/**
 * 就地替换章节中的 Markdown 图片 URL（/plot 精修回写）。
 * 若正文找不到旧 URL，则追加到节末。
 */
export async function replaceOrAppendSectionImage(
  projectId: string,
  sectionKey: string,
  input: {
    newImageUrl: string;
    caption: string;
    replaceImageUrl?: string;
  },
): Promise<"replaced" | "appended"> {
  const { replaceMarkdownImageUrl } = await import("@/lib/agent/chart-markdown");
  const project = await getProject(projectId);
  if (!project) throw new Error("项目未找到");
  const current = project.sections[sectionKey] ?? "";
  const oldUrl = input.replaceImageUrl?.trim() || "";
  if (oldUrl) {
    const { next, replaced } = replaceMarkdownImageUrl(
      current,
      oldUrl,
      input.newImageUrl,
      input.caption,
    );
    if (replaced > 0) {
      await patchProjectSection(projectId, sectionKey, next);
      return "replaced";
    }
  }
  const chunk = `\n\n![${input.caption}](${input.newImageUrl})\n\n`;
  await patchProjectSection(projectId, sectionKey, current + chunk);
  return "appended";
}

/** PATCH /api/projects/:id/charts — 登记图表资产 */
export async function patchProjectCharts(
  projectId: string,
  ops: ChartPatchOp[],
): Promise<ProjectChartAsset[]> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/charts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存图表资产失败");
  }
  const data = (await res.json()) as { charts: ProjectChartAsset[] };
  return data.charts;
}

/** GET /api/projects/:id/charts — 读图表资产（精修回放） */
export async function getProjectCharts(
  projectId: string,
  opts?: { assetId?: string; imageUrl?: string },
): Promise<{ charts: ProjectChartAsset[]; asset: ProjectChartAsset | null }> {
  const q = new URLSearchParams();
  if (opts?.assetId) q.set("assetId", opts.assetId);
  if (opts?.imageUrl) q.set("imageUrl", opts.imageUrl);
  const qs = q.toString();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/charts${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) {
    return { charts: [], asset: null };
  }
  const data = (await res.json()) as {
    charts?: ProjectChartAsset[];
    asset?: ProjectChartAsset | null;
  };
  const charts = Array.isArray(data.charts) ? data.charts : [];
  return {
    charts,
    asset: data.asset ?? charts[0] ?? null,
  };
}

export async function appendChartAsset(
  projectId: string,
  asset: Extract<ChartPatchOp, { op: "append" }>["asset"],
): Promise<ProjectChartAsset[]> {
  return patchProjectCharts(projectId, [{ op: "append", asset }]);
}

/** PATCH /api/projects/:id/paper-passport — 更新 Phase 0 配置 */
export async function patchPaperPassportConfig(
  projectId: string,
  config: import("@/contracts/paper-passport").PaperConfigRecord,
): Promise<{ paperPassport: string; currentPhase: number }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/paper-passport`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "保存论文配置失败");
  }
  return res.json() as Promise<{ paperPassport: string; currentPhase: number }>;
}

/** POST /api/projects/:id/paper-passport/sync — 重算阶段进度 */
export async function syncPaperPassport(
  projectId: string,
): Promise<{ paperPassport: string; currentPhase: number }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/paper-passport/sync`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "同步阶段进度失败");
  }
  return res.json() as Promise<{ paperPassport: string; currentPhase: number }>;
}

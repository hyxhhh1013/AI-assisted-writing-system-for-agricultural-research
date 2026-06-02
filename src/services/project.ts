/** 项目 API 服务封装 — 类型定义已统一到 src/contracts/project.ts */

import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import type {
  ProjectData,
  ReferencePatchOp,
  ProjectReferenceRecord,
} from "@/contracts/project";
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
  const res = await fetch(`/api/projects?id=${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function saveProject(data: ProjectData): Promise<string | null> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
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

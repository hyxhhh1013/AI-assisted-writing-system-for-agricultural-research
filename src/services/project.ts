/** 项目 API 服务封装 — 类型定义已统一到 src/contracts/project.ts */

import type { ProjectData } from "@/contracts/project";

// Re-export so existing importers of services/project don't break
export type { ProjectData, ProjectDTO } from "@/contracts/project";

export interface ProjectListItem {
  id: string;
  title: string;
  lastUpdated: number;
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

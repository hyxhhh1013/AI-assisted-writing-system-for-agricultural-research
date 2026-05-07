/** 项目 API 类型定义与服务封装 */

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

export interface ProjectData {
  id: string;
  title: string;
  userId?: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  lastUpdated: number;
  createdAt?: number;
  sections: SectionRecord;
  references: string[];
  analysisResults: string[];
  charts?: string;
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

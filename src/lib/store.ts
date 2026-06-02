"use client";

import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  patchAnalysisResults,
  replaceReferences as replaceReferencesApi,
} from "@/services/project";
import type { ProjectData, ProjectListItem, SectionRecord } from "@/services/project";

export type { ProjectData } from "@/services/project";

import { IMRAD_BODY_KEYS } from "@/lib/imrad";

const DEFAULT_SECTIONS = {
  introduction: "",
  methods: "",
  results: "",
  conclusion: "",
} satisfies SectionRecord;

export const projectStore = {
  async list(): Promise<ProjectListItem[]> {
    return listProjects();
  },

  async get(id: string): Promise<ProjectData | null> {
    return getProject(id);
  },

  async save(data: ProjectData): Promise<string | null> {
    return saveProject(data);
  },

  async delete(id: string): Promise<boolean> {
    return deleteProject(id);
  },

  async create(title: string = "新论文项目"): Promise<ProjectData | null> {
    const newProject = this.getDefault("");
    newProject.title = title;
    const id = await saveProject(newProject);
    if (!id) return null;
    return getProject(id);
  },

  getDefault(id: string = ""): ProjectData {
    return {
      id,
      title: "",
      authors: "【请填写作者姓名】",
      affiliations: "农业科学研究中心，北京 100083",
      abstract: "",
      keywords: "",
      classification: "",
      researchDirection: "",
      outline: "",
      template: "sci",
      mode: "review",
      sections: { ...DEFAULT_SECTIONS },
      analysisResults: [],
      references: [],
      lastUpdated: Date.now(),
      expandedOutlineSections: [],
    };
  },

  getCurrentId(): string | null {
    // 已废弃 — 改用 useSearchParams
    return null;
  },

  async update(id: string, updates: Partial<ProjectData>): Promise<ProjectData | null> {
    const existing = await getProject(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates, id };
    const savedId = await saveProject(merged);
    if (!savedId) return null;
    return getProject(savedId);
  },

  async appendAnalysisResult(projectId: string, content: string): Promise<string[]> {
    const rows = await patchAnalysisResults(projectId, [{ op: "create", content }]);
    return rows.map((r) => r.content);
  },

  async replaceReferences(projectId: string, items: string[]): Promise<string[]> {
    const rows = await replaceReferencesApi(projectId, items);
    return rows.map((r) => r.content);
  },
};

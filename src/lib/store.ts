"use client";

import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  patchAnalysisResults,
  replaceReferences as replaceReferencesApi,
} from "@/services/project";
import type { ProjectData } from "@/contracts/project";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import { getDefaultProjectTitle } from "@/contracts/writing-mode";
import type { ProjectListItem } from "@/services/project";

const RESEARCH_DEFAULT_SECTIONS: Record<string, string> = {
  introduction: "",
  methods: "",
  results: "",
  conclusion: "",
};

const REVIEW_DEFAULT_SECTIONS: Record<string, string> = {
  introduction: "",
  background: "",
  literature_body: "",
  conclusion: "",
};

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

  async create(
    mode: ProjectWritingMode = "review",
    title?: string,
  ): Promise<ProjectData | null> {
    const newProject = this.getDefault("", mode);
    newProject.title = title?.trim() || getDefaultProjectTitle(mode);
    const id = await saveProject(newProject);
    if (!id) return null;
    return getProject(id);
  },

  getDefault(id: string = "", mode: ProjectWritingMode = "review"): ProjectData {
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
      template: mode === "research" ? "sci" : "gbt7713",
      mode,
      sections:
        mode === "research"
          ? { ...RESEARCH_DEFAULT_SECTIONS }
          : { ...REVIEW_DEFAULT_SECTIONS },
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

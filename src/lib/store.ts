"use client";

import { listProjects, getProject, saveProject, deleteProject } from "@/services/project";
import type { ProjectData, SectionRecord } from "@/services/project";

export type { ProjectData } from "@/services/project";

const DEFAULT_SECTIONS: SectionRecord = {
  introduction: "",
  methods: "",
  results: "",
  conclusion: "",
};

export const projectStore = {
  async list(): Promise<{ id: string; title: string; lastUpdated: number }[]> {
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
      authors: "Lab Member",
      affiliations: "农业科学研究中心，北京 100083",
      abstract: "",
      keywords: "",
      classification: "",
      researchDirection: "",
      outline: "",
      template: "sci",
      sections: { ...DEFAULT_SECTIONS },
      analysisResults: [],
      references: [],
      lastUpdated: Date.now(),
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
};

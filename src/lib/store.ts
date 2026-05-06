"use client";

export interface ProjectData {
  id: string;
  title: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string; // 'sci' | 'ieee' | 'gbt7713' | 'nature'
  sections: Record<string, string>;
  analysisResults: string[];
  references: string[];
  lastUpdated: number;
}

/**
 * ProjectStore 现在作为后端 API 的封装
 * 所有的持久化逻辑都迁移到了服务器端数据库
 */
export const projectStore = {
  // 获取所有项目列表
  async list(): Promise<{ id: string; title: string; lastUpdated: number }[]> {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error("Store list error:", e);
      return [];
    }
  },

  // 获取特定项目数据
  async get(id: string): Promise<ProjectData | null> {
    if (!id) return null;
    try {
      const res = await fetch(`/api/projects?id=${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error("Store get error:", e);
      return null;
    }
  },

  // 保存项目数据
  async save(data: ProjectData): Promise<string | null> {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const result = await res.json();
      return result.id;
    } catch (e) {
      console.error("Store save error:", e);
      return null;
    }
  },

  // 创建新项目
  async create(title: string = "新论文项目"): Promise<ProjectData | null> {
    const newProject = this.getDefault("");
    newProject.title = title;
    const id = await this.save(newProject);
    if (!id) return null;
    return await this.get(id);
  },

  // 删除项目
  async delete(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
      return res.ok;
    } catch (e) {
      console.error("Store delete error:", e);
      return false;
    }
  },

  // 获取当前正在编辑的项目ID（现在由 URL 参数管理）
  getCurrentId(): string | null {
    return null;
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
      sections: {
        introduction: "",
        methods: "",
        results: "",
        conclusion: "",
      },
      analysisResults: [],
      references: [],
      lastUpdated: Date.now(),
    };
  },
};

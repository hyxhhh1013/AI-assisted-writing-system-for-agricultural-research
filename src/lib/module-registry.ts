import type { AppModule, ModuleIconKey, ModulePlacement } from "@/contracts/modules";
import { isModuleEnabled } from "@/lib/feature-flags";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  FileText,
  Layout,
  Play,
  Radar,
  Search,
  Settings,
} from "lucide-react";

/** 唯一真相源：模块 id / 路由 / 开关 / 展示位置 */
export const APP_MODULES: AppModule[] = [
  {
    id: "workbench",
    title: "全能科研工作台",
    description: "集成式论文创作环境，支持数据分析、大纲生成、AI 扩写与实时预览",
    href: "/workbench",
    flag: "WRITING",
    placement: ["home"],
    iconKey: "file-text",
    order: 10,
  },
  {
    id: "projects",
    title: "项目管理中心",
    description: "管理多篇论文创作进度，支持多项目切换、归档与快速导出",
    href: "/projects",
    flag: "WRITING",
    placement: ["home"],
    iconKey: "layout",
    order: 20,
  },
  {
    id: "knowledge",
    title: "文献库管理",
    description: "管理实验室私有文献，支持 PDF 查看、语义检索与 AI 划词翻译",
    href: "/knowledge",
    flag: "KNOWLEDGE",
    placement: ["home"],
    iconKey: "database",
    order: 30,
  },
  {
    id: "plagiarism",
    title: "论文查重与降重",
    description: "检测论文重复率，AI 辅助降重改写，支持本地库 + 联网比对",
    href: "/plagiarism",
    flag: "PLAGIARISM",
    placement: ["home"],
    iconKey: "search",
    order: 40,
  },
  {
    id: "plot",
    title: "数据绘图",
    description: "分组柱状图、折线图、XRD 图与 GB/T 三线表，一键生成论文配图",
    href: "/plot",
    requiresProjectId: true,
    flag: "CHART",
    placement: ["home", "workbench-sidebar"],
    iconKey: "bar-chart",
    order: 50,
  },
  {
    id: "xrd-lab",
    title: "XRD 实验室",
    description: "峰分解、背景扣除、晶胞拟合与 XPS 等材料表征分析工具",
    href: "/xrd-lab",
    flag: "XRD",
    placement: ["home"],
    iconKey: "radar",
    order: 55,
  },
  {
    id: "presentation",
    title: "项目演示文档",
    description: "快速了解项目核心功能、技术架构与科学依据的网页版演示稿",
    href: "/presentation",
    flag: null,
    placement: ["home"],
    iconKey: "play",
    order: 60,
  },
  {
    id: "guide",
    title: "使用指南",
    description: "写给实验室同学的快速上手指南，包含每一步的详细操作说明",
    href: "/guide",
    flag: null,
    placement: ["home"],
    iconKey: "book-open",
    order: 70,
  },
];

export const MODULE_ICON_MAP: Record<ModuleIconKey, LucideIcon> = {
  "file-text": FileText,
  layout: Layout,
  database: Settings,
  search: Search,
  "bar-chart": BarChart3,
  radar: Radar,
  "book-open": BookOpen,
  play: Play,
  flask: Radar,
};

export function listModules(options?: {
  placement?: ModulePlacement;
}): AppModule[] {
  let modules = APP_MODULES.filter(isModuleEnabled);
  if (options?.placement) {
    modules = modules.filter((m) => m.placement.includes(options.placement!));
  }
  return modules.sort((a, b) => a.order - b.order);
}

export function getModuleHref(module: AppModule, projectId?: string | null): string {
  if (module.requiresProjectId && projectId) {
    return `${module.href}?id=${encodeURIComponent(projectId)}`;
  }
  return module.href;
}

export function getModuleById(id: string): AppModule | undefined {
  return APP_MODULES.find((m) => m.id === id);
}

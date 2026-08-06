import type { AppModule, HomeModuleCategory, ModuleIconKey, ModulePlacement } from "@/contracts/modules";
import { isModuleEnabled } from "@/lib/feature-flags";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  FileText,
  GraduationCap,
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
    homeCategory: "core",
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
    homeCategory: "core",
    iconKey: "layout",
    order: 20,
  },
  {
    id: "directions",
    title: "研究方向规划",
    description: "Socratic 预承诺、8 维度 Rubric 分析、论文路线图与 Direction→Writing 桥接",
    href: "/directions",
    flag: null,
    placement: ["home"],
    homeCategory: "core",
    iconKey: "flask",
    order: 25,
  },
  {
    id: "academic-paper",
    title: "写作 Agent 引导",
    description: "选论文项目，进入工作台 Agent Tab；八阶段由 Passport 管理，本页不做假流水线",
    href: "/academic-paper",
    flag: null,
    placement: ["home"],
    homeCategory: "core",
    iconKey: "graduation-cap",
    order: 12,
  },
  {
    id: "knowledge",
    title: "文献库管理",
    description: "管理实验室私有文献，支持 PDF 查看、语义检索与 AI 划词翻译",
    href: "/knowledge",
    flag: "KNOWLEDGE",
    placement: ["home"],
    homeCategory: "tools",
    iconKey: "database",
    order: 30,
  },
  {
    id: "plagiarism",
    title: "论文质量中心",
    description: "提交前一站式质量检查：多源查重、AI 降重、四维度论文审查",
    href: "/plagiarism",
    flag: "PLAGIARISM",
    placement: ["home"],
    homeCategory: "tools",
    iconKey: "search",
    order: 40,
  },
  {
    id: "plot",
    title: "数据绘图",
    description: "分组柱状图、折线图、XRD/XPS 光谱与 GB/T 三线表，一键生成论文配图",
    href: "/plot",
    requiresProjectId: true,
    flag: "CHART",
    placement: ["home", "workbench-sidebar"],
    homeCategory: "tools",
    iconKey: "bar-chart",
    order: 50,
  },
  {
    id: "xrd-lab",
    title: "光谱分析",
    description: "XRD 叠加、峰拟合、XPS 与 Scherrer 等（已并入科学绘图）",
    href: "/plot?category=xrd",
    flag: "XRD",
    placement: ["home"],
    homeCategory: "tools",
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
    homeCategory: "help",
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
    homeCategory: "help",
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
  "graduation-cap": GraduationCap,
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

const HOME_CATEGORY_ORDER: HomeModuleCategory[] = ["core", "tools", "help"];

export function groupHomeModules(): Record<HomeModuleCategory, AppModule[]> {
  const grouped: Record<HomeModuleCategory, AppModule[]> = {
    core: [],
    tools: [],
    help: [],
  };
  for (const appModule of listModules({ placement: "home" })) {
    const category = appModule.homeCategory ?? "tools";
    grouped[category].push(appModule);
  }
  return grouped;
}

export const HOME_SECTION_LABELS: Record<HomeModuleCategory, string> = {
  core: "写作核心",
  tools: "数据与质量",
  help: "帮助与说明",
};

export { HOME_CATEGORY_ORDER };

export function getModuleHref(module: AppModule, projectId?: string | null): string {
  if (module.requiresProjectId && projectId) {
    return `${module.href}?id=${encodeURIComponent(projectId)}`;
  }
  return module.href;
}

export function getModuleById(id: string): AppModule | undefined {
  return APP_MODULES.find((m) => m.id === id);
}

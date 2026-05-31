/** featureFlags 环境变量键；null 表示始终展示（如指南） */
export type ModuleFlagKey =
  | "WRITING"
  | "OUTLINE"
  | "ANALYSIS"
  | "TRANSLATE"
  | "PLAGIARISM"
  | "CHART"
  | "KNOWLEDGE"
  | "CONSISTENCY"
  | "XRD"
  | "PDF"
  | "EXPERIMENTAL_DATA_INJECTION"
  | "REVIEW";

export type ModulePlacement =
  | "home"
  | "workbench-sidebar"
  | "workbench-tab"
  | "tool";

export type ModuleIconKey =
  | "file-text"
  | "layout"
  | "database"
  | "search"
  | "bar-chart"
  | "radar"
  | "book-open"
  | "play"
  | "flask";

export interface AppModule {
  id: string;
  title: string;
  description: string;
  href: string;
  /** 为 true 时跳转 append `?id={projectId}`（工作台侧栏外链） */
  requiresProjectId?: boolean;
  flag: ModuleFlagKey | null;
  placement: ModulePlacement[];
  iconKey: ModuleIconKey;
  order: number;
}

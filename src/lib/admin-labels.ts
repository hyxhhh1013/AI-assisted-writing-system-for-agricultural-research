/** Admin 后台展示用标签常量 */

export const ADMIN_TPL_LABEL: Record<string, string> = {
  sci: "SCI",
  ieee: "IEEE",
  gbt7713: "GB/T 7713",
  nature: "Nature",
};

export const ADMIN_MODE_LABEL: Record<string, string> = {
  review: "综述",
  research: "研究",
};

export const ADMIN_GRADE_COLOR: Record<string, string> = {
  A: "bg-green-50 text-green-700",
  B: "bg-blue-50 text-blue-700",
  C: "bg-amber-50 text-amber-700",
  D: "bg-red-50 text-red-700",
};

export const ADMIN_RISK_BADGE: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-green-50 text-green-700",
};

export const ADMIN_RISK_LABEL: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export const ADMIN_REVIEW_DIM_LABEL: Record<string, string> = {
  academic: "学术规范",
  argument: "论证质量",
  structure: "结构规范",
  integrity: "学术诚信",
};

export function adminTplLabel(template: string): string {
  return ADMIN_TPL_LABEL[template] ?? template;
}

export function adminModeLabel(mode: string): string {
  return ADMIN_MODE_LABEL[mode] ?? mode ?? "综述";
}

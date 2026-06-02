/** GET /api/figures/registry — 图表注册表 */

export interface FigureDef {
  id: string;
  name: string;
  category: string;
  description: string;
  endpoint: string;
  input_type: "tabular" | "json" | "form";
  example?: string;
  config_fields?: { key: string; label: string; type: string; options?: string[] }[];
}

export interface FigureCategoryDef {
  id: string;
  name: string;
  icon: string;
  order: number;
}

export interface FigureRegistry {
  categories: FigureCategoryDef[];
  figures: FigureDef[];
}

export async function getFigureRegistry(): Promise<FigureRegistry> {
  const res = await fetch("/api/figures/registry");
  if (!res.ok) throw new Error("加载图表注册表失败");
  return res.json() as Promise<FigureRegistry>;
}

export type FigureTool = "chart" | "flow" | "mechanism";

export interface FigureSpec {
  tool: FigureTool;
  config: Record<string, unknown>;
  caption: string;
}

export interface FigureGenerationResult {
  spec: string;
  tool: string;
  config: string;
  caption: string;
  status: "pending" | "generating" | "done" | "failed";
  imageUrl?: string;
}

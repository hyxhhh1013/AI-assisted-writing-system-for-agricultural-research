/** Writing API 请求模式（与 @/lib/validations writingSchema 对齐） */
export const WRITING_MODES = ["full", "fast", "audit_only", "fix_only"] as const;
export type WritingMode = (typeof WRITING_MODES)[number];

export const WRITING_PIPELINE_STEPS = [
  "retrieving",
  "building_context",
  "writing",
  "verifying",
  "refining",
  "checking_citations",
  "checking_data",
] as const;
export type WritingPipelineStep = (typeof WRITING_PIPELINE_STEPS)[number];

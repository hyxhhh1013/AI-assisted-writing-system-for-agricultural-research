import { z } from "zod";
import { IMRAD_SECTION_KEYS } from "@/lib/imrad";

// === Writing ===
export const writingSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  section: z.enum(IMRAD_SECTION_KEYS),
  context: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
  template: z.enum(["sci", "ieee", "gbt7713", "nature"]).optional().default("sci"),
  existingReferences: z.array(z.string()).optional(),
  // globalContext 是前端传来的包含 abstract/outline/sectionPreviews 的复杂对象
  globalContext: z.unknown().optional(),
  mode: z.enum(["full", "fast", "audit_only", "fix_only"]).optional().default("full"),
  verificationFeedback: z.string().optional(),
  retrievalMode: z.enum(["balanced", "precise", "extensive"]).optional().default("balanced"),
  researchDirection: z.string().optional(),
  // 扩展字段（子章节 / 图表 / 数据核查）
  subsectionTitle: z.string().optional(),
  figureStart: z.number().int().optional(),
  evidenceSummary: z.string().optional(),
  projectMode: z.enum(["review", "research"]).optional(),
  dataClaims: z.array(z.unknown()).optional().default([]),
  citationStyle: z.enum(["gbt7714", "vancouver", "apa7", "ieee"]).optional().default("gbt7714"),
});
export type WritingInput = z.infer<typeof writingSchema>;

// === Outline ===
export const outlineSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  researchDirection: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
  category: z.string().optional(),
});
export type OutlineInput = z.infer<typeof outlineSchema>;

// === Translation ===
export const translateSchema = z.object({
  text: z.string().min(1, "文本不能为空"),
  targetLang: z.enum(["zh", "en"]).optional().default("zh"),
});
export type TranslateInput = z.infer<typeof translateSchema>;

// === Analysis ===
export const analysisSchema = z.object({
  dataSummary: z.string().min(1, "数据摘要不能为空"),
  researchDirection: z.string().optional(),
});
export type AnalysisInput = z.infer<typeof analysisSchema>;

// === Consistency Check ===
export const consistencySchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  // sections 是 { key: string; content: string }[] 对象数组
  sections: z.array(z.object({ key: z.string(), content: z.string() })).min(1, "至少需要一个章节"),
  outline: z.string().optional().default(""),
  dataClaims: z.array(z.unknown()).optional(),
});
export type ConsistencyInput = z.infer<typeof consistencySchema>;

// === Chat ===
export const chatSchema = z.object({
  filename: z.string().min(1, "文献名不能为空"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .min(1, "消息列表不能为空"),
});
export type ChatInput = z.infer<typeof chatSchema>;

// === Plagiarism Check ===
export const plagiarismCheckSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1, "标题不能为空"),
  content: z.string().min(50, "内容至少需要50个字符"),
  webSearch: z.boolean().optional().default(false),
});
export type PlagiarismCheckInput = z.infer<typeof plagiarismCheckSchema>;

// === Plagiarism Rewrite ===
export const plagiarismRewriteSchema = z.object({
  checkId: z.string().min(1, "checkId 不能为空"),
  matchId: z.string().optional(),
  originalText: z.string().min(1, "原文不能为空"),
  contextText: z.string().optional(),
});
export type PlagiarismRewriteInput = z.infer<typeof plagiarismRewriteSchema>;

// === Knowledge Analyze ===
export const knowledgeAnalyzeSchema = z.object({
  filename: z.string().min(1, "文献名不能为空"),
  chunkIndex: z.number().int().optional(),
  mode: z.enum(["chunk", "full"]).optional().default("full"),
});
export type KnowledgeAnalyzeInput = z.infer<typeof knowledgeAnalyzeSchema>;

// === Knowledge Metadata PATCH ===
export const knowledgeBibSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  firstAuthor: z.string().optional(),
  year: z.coerce.number().int().min(1000).max(9999).optional(),
  journal: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  doi: z.string().optional(),
  patentNumber: z.string().optional(),
  inventors: z.array(z.string()).optional(),
  applicant: z.string().optional(),
  publicationDate: z.string().optional(),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
});

export const knowledgeMetadataPatchSchema = z.object({
  action: z.literal("update_metadata"),
  name: z.string().min(1, "文献名不能为空"),
  bib: knowledgeBibSchema,
  documentType: z.enum(["paper", "journal", "patent", "book", "other"]).optional(),
  gbTag: z.enum(["J", "M", "P", "D", "C", "S"]).optional(),
});
export type KnowledgeMetadataPatchInput = z.infer<typeof knowledgeMetadataPatchSchema>;

// === Review (论文审查) ===
export const reviewSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1, "标题不能为空"),
  sections: z
    .array(z.object({ key: z.string(), content: z.string() }))
    .min(1, "至少需要一个章节"),
  outline: z.string().optional(),
  dimensions: z
    .array(z.enum(["academic", "argument", "structure", "integrity"]))
    .optional(),
  target: z.string().optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

// === Project evidence PATCH ===
export const projectEvidencePatchSchema = z
  .object({
    dataClaims: z.string().optional(),
    dataSources: z.string().optional(),
  })
  .refine(
    (data) => data.dataClaims !== undefined || data.dataSources !== undefined,
    { message: "至少提供 dataClaims 或 dataSources" },
  );
export type ProjectEvidencePatchInput = z.infer<typeof projectEvidencePatchSchema>;

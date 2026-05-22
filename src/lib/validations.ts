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
  globalContext: z.string().optional(),
  mode: z.enum(["full", "fast", "audit_only", "fix_only"]).optional().default("full"),
  verificationFeedback: z.string().optional(),
  retrievalMode: z.string().optional(),
  researchDirection: z.string().optional(),
});
export type WritingInput = z.infer<typeof writingSchema>;

// === Outline ===
export const outlineSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  researchDirection: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
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
  sections: z.array(z.string()).min(1, "至少需要一个章节"),
  outline: z.string().optional(),
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

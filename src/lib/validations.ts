import { z } from "zod";
import { IMRAD_SECTION_KEYS } from "@/lib/imrad";
import { REVIEW_SECTION_KEYS } from "@/lib/review-structure";
import { isSectionValidForMode } from "@/lib/section-registry";

const WRITING_SECTION_ENUM = [
  ...new Set([...IMRAD_SECTION_KEYS, ...REVIEW_SECTION_KEYS, "discussion"]),
] as [
  "abstract",
  "introduction",
  "background",
  "literature_body",
  "methods",
  "results",
  "discussion",
  "conclusion",
];

// === Writing ===
export const writingSchema = z
  .object({
    title: z.string().min(1, "标题不能为空"),
    section: z.enum(WRITING_SECTION_ENUM),
    context: z.string().optional(),
    language: z.enum(["zh", "en"]).optional().default("zh"),
    template: z.enum(["sci", "ieee", "gbt7713", "nature"]).optional().default("sci"),
    existingReferences: z.array(z.string()).optional(),
    globalContext: z.unknown().optional(),
    mode: z.enum(["full", "fast", "audit_only", "fix_only"]).optional().default("full"),
    verificationFeedback: z.string().optional(),
    retrievalMode: z.enum(["balanced", "precise", "extensive"]).optional().default("balanced"),
    researchDirection: z.string().optional(),
    subsectionTitle: z.string().optional(),
    figureStart: z.number().int().optional(),
    evidenceSummary: z.string().optional(),
    projectMode: z.enum(["review", "research"]).optional(),
    dataClaims: z.array(z.unknown()).optional().default([]),
    citationStyle: z.enum(["gbt7714", "vancouver", "apa7", "ieee"]).optional().default("gbt7714"),
  })
  .superRefine((data, ctx) => {
    if (!isSectionValidForMode(data.section, data.projectMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `章节 "${data.section}" 与项目类型 ${data.projectMode ?? "review"} 不匹配`,
        path: ["section"],
      });
    }
  });
export type WritingInput = z.infer<typeof writingSchema>;

// === Outline ===
export const outlineSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  researchDirection: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
  category: z.string().optional(),
  projectMode: z.enum(["review", "research"]).optional(),
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
  sections: z.array(z.object({ key: z.string(), content: z.string() })).min(1, "至少需要一个章节"),
  outline: z.string().optional().default(""),
  dataClaims: z.array(z.unknown()).optional(),
  projectMode: z.enum(["review", "research"]).optional(),
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

/** v2 查重与 plagiarismCheckSchema 同构 */
export const plagiarismV2Schema = plagiarismCheckSchema;
export type PlagiarismV2Input = PlagiarismCheckInput;

export const plagiarismRewritePatchSchema = z.object({
  suggestionId: z.string().min(1, "suggestionId 不能为空"),
  status: z.enum(["accepted", "rejected"]),
});
export type PlagiarismRewritePatchInput = z.infer<typeof plagiarismRewritePatchSchema>;

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
  issn: z.string().optional(),
  eissn: z.string().optional(),
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

export const knowledgeFileRefSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
});

export const knowledgeUploadFieldsSchema = z.object({
  category: z.string().optional().default("未分类"),
  documentType: z.enum(["paper", "journal", "patent", "book", "other"]).optional().default("paper"),
});
export type KnowledgeUploadFieldsInput = z.infer<typeof knowledgeUploadFieldsSchema>;

export const knowledgeBatchMoveSchema = z.object({
  action: z.literal("batch_move"),
  files: z.array(knowledgeFileRefSchema).min(1, "文件列表不能为空"),
  newCategory: z.string().min(1, "目标分类不能为空"),
});
export type KnowledgeBatchMoveInput = z.infer<typeof knowledgeBatchMoveSchema>;

export const knowledgeCategoryPatchSchema = z.object({
  name: z.string().min(1, "文献名不能为空"),
  oldCategory: z.string().min(1, "原分类不能为空"),
  newCategory: z.string().min(1, "新分类不能为空"),
  documentType: z.enum(["paper", "journal", "patent", "book", "other"]).optional(),
});
export type KnowledgeCategoryPatchInput = z.infer<typeof knowledgeCategoryPatchSchema>;

export const knowledgeDeleteBatchSchema = z.object({
  files: z.array(knowledgeFileRefSchema).min(1, "文件列表不能为空"),
});
export type KnowledgeDeleteBatchInput = z.infer<typeof knowledgeDeleteBatchSchema>;

export const knowledgeDeleteQuerySchema = z.object({
  name: z.string().min(1, "缺少 name"),
  category: z.string().min(1, "缺少 category"),
});
export type KnowledgeDeleteQueryInput = z.infer<typeof knowledgeDeleteQuerySchema>;

export const reindexRequestSchema = z.object({
  files: z.array(z.string().min(1)).optional(),
  forceStage1: z.boolean().optional(),
  forceStage3: z.boolean().optional(),
});
export type ReindexRequestInput = z.infer<typeof reindexRequestSchema>;

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
  projectMode: z.enum(["review", "research"]).optional(),
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

export const projectMetaPatchSchema = z
  .object({
    title: z.string().optional(),
    authors: z.string().optional(),
    affiliations: z.string().optional(),
    abstract: z.string().optional(),
    keywords: z.string().optional(),
    classification: z.string().optional(),
    researchDirection: z.string().optional(),
    outline: z.string().optional(),
    template: z.string().optional(),
    mode: z.string().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "无可更新的字段" },
  );
export type ProjectMetaPatchInput = z.infer<typeof projectMetaPatchSchema>;

export const projectSectionPatchSchema = z.object({
  content: z.string(),
});
export type ProjectSectionPatchInput = z.infer<typeof projectSectionPatchSchema>;

const referencePatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    content: z.string().min(1, "content 不能为空"),
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1, "缺少 id"),
    content: z.string().min(1, "content 不能为空"),
  }),
  z.object({
    op: z.literal("delete"),
    id: z.string().min(1, "缺少 id"),
  }),
  z.object({
    op: z.literal("replace"),
    items: z.array(z.string()),
  }),
]);

export const projectReferencesPatchSchema = z.object({
  ops: z.array(referencePatchOpSchema).min(1).max(500),
});
export type ProjectReferencesPatchInput = z.infer<typeof projectReferencesPatchSchema>;

const analysisResultPatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    content: z.string().min(1, "content 不能为空"),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1, "缺少 id"),
    content: z.string().min(1, "content 不能为空"),
  }),
  z.object({
    op: z.literal("delete"),
    id: z.string().min(1, "缺少 id"),
  }),
]);

export const projectAnalysisResultsPatchSchema = z.object({
  ops: z.array(analysisResultPatchOpSchema).min(1).max(500),
});
export type ProjectAnalysisResultsPatchInput = z.infer<
  typeof projectAnalysisResultsPatchSchema
>;

// === Admin ===
export const adminUserRolePatchSchema = z.object({
  userId: z.string().min(1, "缺少 userId"),
  role: z.enum(["user", "admin"]),
});
export type AdminUserRolePatchInput = z.infer<typeof adminUserRolePatchSchema>;

export const adminUserDeleteSchema = z.object({
  userId: z.string().min(1, "缺少 userId"),
});
export type AdminUserDeleteInput = z.infer<typeof adminUserDeleteSchema>;

export const adminProjectDeleteSchema = z.object({
  projectId: z.string().min(1, "缺少 projectId"),
});
export type AdminProjectDeleteInput = z.infer<typeof adminProjectDeleteSchema>;

export const adminKnowledgeFileRefSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
});

export const adminKnowledgeDeleteSchema = z
  .object({
    name: z.string().optional(),
    category: z.string().optional(),
    files: z.array(adminKnowledgeFileRefSchema).optional(),
  })
  .refine((data) => (data.files && data.files.length > 0) || !!data.name, {
    message: "缺少文件信息",
  });
export type AdminKnowledgeDeleteInput = z.infer<typeof adminKnowledgeDeleteSchema>;

export const adminKnowledgeReindexSchema = z.object({
  name: z.string().min(1, "缺少文件名"),
  forceStage1: z.boolean().optional(),
  forceStage3: z.boolean().optional(),
});
export type AdminKnowledgeReindexInput = z.infer<typeof adminKnowledgeReindexSchema>;

export const adminSettingPutSchema = z.object({
  key: z.string().min(1, "缺少 key"),
  value: z.string(),
});
export type AdminSettingPutInput = z.infer<typeof adminSettingPutSchema>;

export const adminSettingDeleteSchema = z.object({
  key: z.string().min(1, "缺少 key"),
});
export type AdminSettingDeleteInput = z.infer<typeof adminSettingDeleteSchema>;

// === Chart / Table / XRD ===
export const chartModeSchema = z.enum(["generic", "crd"]).default("generic");

export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const tableGroupSchema = z.object({
  label: z.string().min(1),
  n: z.number(),
  mean: z.number(),
  sd: z.number(),
});

export const tableGenerateSchema = z.object({
  title: z.string().min(1, "表标题不能为空"),
  columnHeader: z.string().optional(),
  groups: z.array(tableGroupSchema).min(2, "请提供至少 2 个处理组数据"),
  anova: z
    .object({
      F: z.number(),
      df1: z.number(),
      df2: z.number(),
      p: z.number(),
    })
    .optional(),
  posthoc: z
    .array(
      z.object({
        pair: z.tuple([z.string(), z.string()]),
        p: z.number(),
      }),
    )
    .optional(),
  alpha: z.number().optional(),
  note: z.string().optional(),
});
export type TableGenerateInput = z.infer<typeof tableGenerateSchema>;

const braggHklSchema = z.tuple([z.number(), z.number(), z.number()]);

export const xrdBraggSchema = z.object({
  crystal_system: z.union([z.string(), z.number()]),
  lattice_init: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
  hkl: z.array(braggHklSchema).min(1),
  exp_angles: z.array(z.number()).min(1),
  wavelength: z.number().optional(),
  title: z.string().optional(),
  subset_number: z.number().optional(),
  low_bound: z.number().optional(),
  up_bound: z.number().optional(),
  tao: z.number().optional(),
});
export type XrdBraggInput = z.infer<typeof xrdBraggSchema>;

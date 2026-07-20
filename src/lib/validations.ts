import { z } from "zod";
import {
  getMinDraftChars,
  isWritingDraftReady,
  MAX_WRITING_BULLETS,
  MIN_DRAFT_CHARS_SHORT,
  MIN_WRITING_BULLETS,
  normalizeWritingBullets,
  resolveWritingDraftContext,
} from "@/contracts/writing";
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
    mode: z.enum(["full", "fast", "audit_only", "fix_only", "expand_bullet"]).optional().default("full"),
    verificationFeedback: z.string().optional(),
    retrievalMode: z.enum(["balanced", "precise", "extensive"]).optional().default("balanced"),
    researchDirection: z.string().optional(),
    subsectionTitle: z.string().optional(),
    figureStart: z.number().int().optional(),
    evidenceSummary: z.string().optional(),
    projectMode: z.enum(["review", "research"]).optional(),
    dataClaims: z.array(z.unknown()).optional().default([]),
    citationStyle: z.enum(["gbt7714", "vancouver", "apa7", "ieee"]).optional().default("gbt7714"),
    selectedSourceIds: z.array(z.string()).optional(),
    bullets: z.array(z.string()).max(MAX_WRITING_BULLETS).optional(),
    bulletIndex: z.number().int().min(0).optional(),
    draftSoFar: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isSectionValidForMode(data.section, data.projectMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `章节 "${data.section}" 与项目类型 ${data.projectMode ?? "review"} 不匹配`,
        path: ["section"],
      });
    }
    if (data.mode === "expand_bullet") {
      const normalized = normalizeWritingBullets(data.bullets);
      if (normalized.length < MIN_WRITING_BULLETS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `expand_bullet 至少需要 ${MIN_WRITING_BULLETS} 条有效要点`,
          path: ["bullets"],
        });
      }
      if (data.bulletIndex === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "expand_bullet 需要 bulletIndex",
          path: ["bulletIndex"],
        });
      } else if (data.bulletIndex >= normalized.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "bulletIndex 超出要点范围",
          path: ["bulletIndex"],
        });
      }
      return;
    }
    if (data.mode === "audit_only" || data.mode === "fix_only") {
      if (!data.context?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "缺少待处理正文",
          path: ["context"],
        });
      }
      return;
    }

    const normalized = normalizeWritingBullets(data.bullets);
    const resolved = resolveWritingDraftContext(data.context, data.bullets);
    if (!resolved.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请填写扩写要点或补充说明",
        path: ["bullets"],
      });
      return;
    }

    if (normalized.length >= MIN_WRITING_BULLETS) {
      if (!isWritingDraftReady(data.context, data.bullets, data.section)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "要点总字数或单条长度不足",
          path: ["bullets"],
        });
      }
      return;
    }

    // 有效要点不足 3 条：与 isWritingDraftReady 一致，仅校验补充说明/段落长度
    const minContext =
      data.mode === "fast" ? MIN_DRAFT_CHARS_SHORT : getMinDraftChars(data.section);
    if ((data.context?.trim().length ?? 0) < minContext) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          data.mode === "fast"
            ? `请至少输入 ${minContext} 字后再发起 AI 扩写`
            : `请填写 ${minContext} 字以上补充说明，或补全 ${MIN_WRITING_BULLETS} 条要点`,
        path: ["context"],
      });
    }
  });
export type WritingInput = z.infer<typeof writingSchema>;

export const retrievePreviewSchema = z
  .object({
    title: z.string().min(1, "标题不能为空"),
    section: z.enum(WRITING_SECTION_ENUM),
    context: z.string().optional(),
    bullets: z.array(z.string()).max(MAX_WRITING_BULLETS).optional(),
    language: z.enum(["zh", "en"]).optional().default("zh"),
    existingReferences: z.array(z.string()).optional().default([]),
    researchDirection: z.string().optional(),
    retrievalMode: z.enum(["balanced", "precise", "extensive"]).optional().default("balanced"),
    projectMode: z.enum(["review", "research"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (!isSectionValidForMode(data.section, data.projectMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `章节 "${data.section}" 与项目类型 ${data.projectMode ?? "review"} 不匹配`,
        path: ["section"],
      });
    }
    if (!resolveWritingDraftContext(data.context, data.bullets).trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请先填写扩写要点",
        path: ["bullets"],
      });
    }
    if (!isWritingDraftReady(data.context, data.bullets, data.section)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "要点字数不足或单条过短",
        path: ["bullets"],
      });
    }
  });
export type RetrievePreviewInput = z.infer<typeof retrievePreviewSchema>;

// === Outline ===
export const outlineSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  researchDirection: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
  category: z.string().optional(),
  projectMode: z.enum(["review", "research"]).optional(),
  userSkeleton: z
    .array(z.string().min(1, "骨架条目不能为空"))
    .min(3, "章节骨架至少 3 条"),
});
export type OutlineInput = z.infer<typeof outlineSchema>;

// === PaperPassport ===
export const paperPassportConfigSchema = z.object({
  paperTitle: z.string().min(1, "论文标题不能为空"),
  paperType: z.enum(["review", "research"]),
  targetJournal: z.string(),
  wordCount: z.string().min(1),
  language: z.enum(["zh", "en"]),
  citationStyle: z.enum(["gbt7714", "vancouver", "apa7", "ieee"]),
});
export type PaperPassportConfigInput = z.infer<typeof paperPassportConfigSchema>;

export const paperPassportConfigPatchSchema = z.object({
  config: paperPassportConfigSchema,
});

const figureDataBindingSchema = z.object({
  kind: z.literal("chartConfig"),
  chartConfigIndex: z.number().int().nonnegative(),
  sourceFileName: z.string().optional(),
  variable: z.string().optional(),
  chartTitle: z.string().optional(),
});

const figurePlanItemSchema = z.object({
  id: z.string(),
  sectionPath: z.string().min(1),
  type: z.enum(["flow", "chart", "xrd", "table", "schematic", "other"]),
  purpose: z.string().min(1),
  suggestedCaption: z.string().min(1),
  priority: z.enum(["required", "optional"]),
  dataSource: z.enum(["experiment", "literature", "synthesis"]).optional(),
  dataBinding: figureDataBindingSchema.optional(),
});

const sectionGuideSchema = z.object({
  sectionPath: z.string().min(1),
  purpose: z.string().min(1),
  keyPoints: z.array(z.string()).min(1),
  estimatedParagraphs: z.number().int().positive().optional(),
  assignedSources: z.array(z.string()).optional(),
});

export const writingBlueprintPayloadSchema = z.object({
  version: z.literal(1),
  narrativeSummary: z.string().min(1),
  thesis: z.string().min(1),
  estimatedWordCount: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  figurePlan: z.object({
    totalMin: z.number().int().nonnegative(),
    totalMax: z.number().int().nonnegative(),
    items: z.array(figurePlanItemSchema).min(1),
  }),
  sectionGuides: z.array(sectionGuideSchema).min(1),
  writingOrder: z.array(z.string()),
  prerequisites: z.array(z.string()),
  outlineHash: z.string().optional(),
  generatedAt: z.number().optional(),
});

const blueprintChartCatalogEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  sourceFileName: z.string(),
  variable: z.string().optional(),
});

export const blueprintSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  outline: z.string().min(20, "大纲内容过短"),
  researchDirection: z.string().optional(),
  language: z.enum(["zh", "en"]).optional().default("zh"),
  projectMode: z.enum(["review", "research"]).optional(),
  /** 项目已分析图表目录，供 AI 绑定 dataBinding.chartConfigIndex */
  chartCatalog: z.array(blueprintChartCatalogEntrySchema).optional(),
  /** 从 Direction 分析带入：为什么写这篇论文 */
  motivationFromGap: z.string().optional(),
  /** 建议投稿的目标期刊 */
  targetJournal: z.string().optional(),
  /** 写作时需标注"此处需补实验数据"的缺口 */
  pendingExperiments: z.array(z.string()).optional(),
});
export type BlueprintInput = z.infer<typeof blueprintSchema>;

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

// === Knowledge Bibliography Import (ENG-PR-093) ===
export const bibliographyImportCommitItemSchema = z.object({
  tempId: z.string().min(1),
  action: z.enum(["create", "merge", "skip"]),
  bib: knowledgeBibSchema,
  documentType: z.enum(["paper", "journal", "patent", "book", "other"]).optional(),
  suggestedName: z.string().min(1).optional(),
  targetName: z.string().min(1).optional(),
});

export const bibliographyImportCommitSchema = z.object({
  category: z.string().min(1, "分类不能为空"),
  items: z.array(bibliographyImportCommitItemSchema).min(1, "至少选择一条书目").max(500),
});
export type BibliographyImportCommitInput = z.infer<typeof bibliographyImportCommitSchema>;

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

const chartPatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("append"),
    asset: z.object({
      id: z.string().optional(),
      figureId: z.string().min(1),
      caption: z.string(),
      imageUrl: z.string().min(1),
      svgUrl: z.string().optional(),
      pdfUrl: z.string().optional(),
      sectionKey: z.string().optional(),
      figureSpecEnc: z.string().optional(),
    }),
  }),
  z.object({
    op: z.literal("delete"),
    id: z.string().min(1),
  }),
]);

export const projectChartsPatchSchema = z.object({
  ops: z.array(chartPatchOpSchema).min(1),
});
export type ProjectChartsPatchInput = z.infer<typeof projectChartsPatchSchema>;

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
    language: z.enum(["zh", "en"]).optional(),
    writingBlueprint: z.string().nullable().optional(),
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

const literatureSourceSchema = z.enum([
  "openalex",
  "semantic-scholar",
  "crossref",
  "pubmed",
]);

export const externalLiteratureHitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()),
  year: z.number().int().min(1800).max(2100).optional(),
  journal: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  abstract: z.string().optional(),
  citedByCount: z.number().int().min(0).optional(),
  openAccessUrl: z.string().optional(),
  isOpenAccess: z.boolean().optional(),
  source: literatureSourceSchema,
  sources: z.array(literatureSourceSchema).optional(),
});

export const literatureSearchSchema = z.object({
  query: z.string().trim().min(2, "检索词至少 2 个字符").max(300),
  limit: z.number().int().min(1).max(20).optional(),
});
export type LiteratureSearchInput = z.infer<typeof literatureSearchSchema>;

export const importExternalReferenceSchema = z.object({
  hit: externalLiteratureHitSchema,
  index: z.number().int().min(0).optional(),
});
export type ImportExternalReferenceInput = z.infer<typeof importExternalReferenceSchema>;

// === Direction ===

export const directionCreateSchema = z.object({
  slug: z
    .string()
    .min(1, "URL 标识不能为空")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "仅允许小写字母、数字和连字符"),
  name: z.string().min(1, "方向名称不能为空").max(100),
  description: z.string().max(5000).optional(),
  categories: z.array(z.string()).min(1, "至少关联一个知识库分类"),
  status: z.enum(["active", "archived"]).optional(),
});
export type DirectionCreateInput = z.infer<typeof directionCreateSchema>;

export const directionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).optional(),
  categories: z.array(z.string()).min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});
export type DirectionUpdateInput = z.infer<typeof directionUpdateSchema>;

const directionLiteratureEntrySchema = z.object({
  id: z.string().min(1),
  source: z.enum(["knowledge_pdf", "external", "manual"]),
  sourceKey: z.string().optional(),
  externalId: z.string().optional(),
  title: z.string().min(1),
  citation: z.string().min(1),
  role: z.enum(["core", "supporting", "background"]),
  doi: z.string().optional(),
  addedAt: z.number(),
});

export const directionLiteratureCorpusPatchSchema = z.object({
  ops: z.array(
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("upsert"), entry: directionLiteratureEntrySchema }),
      z.object({ op: z.literal("delete"), entryId: z.string().min(1) }),
      z.object({
        op: z.literal("set_role"),
        entryId: z.string().min(1),
        role: z.enum(["core", "supporting", "background"]),
      }),
      z.object({ op: z.literal("confirm") }),
      z.object({
        op: z.literal("import_kb_scan"),
        entries: z.array(directionLiteratureEntrySchema),
      }),
    ]),
  ),
});
export type DirectionLiteratureCorpusPatchInput = z.infer<
  typeof directionLiteratureCorpusPatchSchema
>;

export const directionLiteratureImportExternalSchema = z.object({
  hit: z.object({
    id: z.string(),
    source: z.enum(["openalex", "semantic-scholar", "crossref", "pubmed"]),
    title: z.string(),
    authors: z.array(z.string()).optional(),
    year: z.number().optional(),
    journal: z.string().optional(),
    doi: z.string().optional(),
    url: z.string().optional(),
    abstract: z.string().optional(),
    citationCount: z.number().optional(),
  }).passthrough(),
  role: z.enum(["core", "supporting", "background"]).optional(),
});
export type DirectionLiteratureImportExternalInput = z.infer<
  typeof directionLiteratureImportExternalSchema
>;

export const directionLiteratureImportKnowledgeSchema = z.object({
  fileName: z.string().min(1),
  citation: z.string().min(1),
  role: z.enum(["core", "supporting", "background"]).optional(),
});
export type DirectionLiteratureImportKnowledgeInput = z.infer<
  typeof directionLiteratureImportKnowledgeSchema
>;

export const evaluationContractSchema = z.object({
  dimensions: z.array(
    z.object({
      id: z.string().regex(/^D[1-8]$/, "维度 ID 必须为 D1-D8"),
      name: z.string().optional(),
      weight: z.number().optional(),
      rubrics: z.array(
        z.object({
          id: z.string(),
          what_to_look_for: z.string(),
          what_triggers_block: z.string(),
          what_triggers_warn: z.string(),
          evidence_required: z.string(),
        }),
      ).optional(),
      // 兼容旧格式
      whatTriggersBlock: z.string().optional(),
      whatTriggersWarn: z.string().optional(),
    }),
  ),
});
export type EvaluationContractInput = z.infer<typeof evaluationContractSchema>;

export const directionAnalyzeSchema = z.object({
  mode: z.enum(["full", "quick", "gap-only"]).default("full"),
});
export type DirectionAnalyzeInput = z.infer<typeof directionAnalyzeSchema>;

export const directionRoadmapSchema = z.object({});
export type DirectionRoadmapInput = z.infer<typeof directionRoadmapSchema>;

export const directionGrantProposalSchema = z.object({
  grantType: z.enum(["国自然面上", "国自然青年", "省基金", "开放课题"]).default("国自然面上"),
});
export type DirectionGrantProposalInput = z.infer<typeof directionGrantProposalSchema>;

export const directionRoadmapConfirmSchema = z.object({
  confirmedAt: z.number().optional(),
  summary: z.string().optional(),
});
export type DirectionRoadmapConfirmInput = z.infer<typeof directionRoadmapConfirmSchema>;

// === Agent (ENG-PR-200 Phase A) ===
export const agentSchema = z.object({
  goal: z.string().min(1, "目标不能为空").max(4000),
  projectId: z.string().optional(),
  directionSlug: z.string().optional(),
  mode: z.enum(["auto", "guided"]).optional().default("auto"),
});
export type AgentInput = z.infer<typeof agentSchema>;

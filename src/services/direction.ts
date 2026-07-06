/** 研究方向 API 服务封装 */

import type {
  DirectionDTO,
  DirectionListItem,
  DirectionAsset,
  ExperimentAsset,
} from "@/contracts/direction";
import type {
  DirectionCreateInput,
  DirectionUpdateInput,
} from "@/lib/validations";

// ==================== 列表 / 创建 ====================

/** GET /api/directions — 获取方向列表 */
export async function listDirections(params?: {
  status?: string;
  q?: string;
}): Promise<{ items: DirectionListItem[]; total: number }> {
  const url = new URL("/api/directions", window.location.origin);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.q) url.searchParams.set("q", params.q);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "获取方向列表失败");
  }
  return res.json();
}

/** POST /api/directions — 创建新方向 */
export async function createDirection(
  input: DirectionCreateInput,
): Promise<DirectionDTO> {
  const res = await fetch("/api/directions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({})) as DirectionDTO & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "创建方向失败");
  }
  return data;
}

// ==================== 单个方向 CRUD ====================

/** GET /api/directions/[slug] — 获取方向详情 */
export async function getDirection(slug: string): Promise<DirectionDTO> {
  const res = await fetch(`/api/directions/${slug}`);
  const data = await res.json().catch(() => ({})) as DirectionDTO & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error || "获取方向失败") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

/** PUT /api/directions/[slug] — 更新方向 */
export async function updateDirection(
  slug: string,
  input: DirectionUpdateInput,
): Promise<DirectionDTO> {
  const res = await fetch(`/api/directions/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({})) as DirectionDTO & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "更新方向失败");
  }
  return data;
}

/** DELETE /api/directions/[slug] — 删除方向 */
export async function deleteDirection(slug: string): Promise<void> {
  const res = await fetch(`/api/directions/${slug}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "删除方向失败");
  }
}

// ==================== 资产管理 ====================

/** PATCH /api/directions/[slug]/assets — 增量更新资产 */
export async function patchAssets(
  slug: string,
  ops: Array<{ op: "upsert" | "delete"; assetId?: string; asset?: DirectionAsset }>,
): Promise<DirectionDTO> {
  const res = await fetch(`/api/directions/${slug}/assets`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  const data = await res.json().catch(() => ({})) as DirectionDTO & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "更新资产失败");
  }
  return data;
}

// ==================== 扫描候选资产 ====================

export interface ScanPaperCandidate {
  id: string;
  kind: "paper";
  doi: string;
  title: string;
  journal: string;
  year: number;
  impactFactor?: number;
  abstract: string;
  contribution: string;
  source: "knowledge_base" | "existing_project";
}

export interface ScanResult {
  paperCandidates: ScanPaperCandidate[];
  projectCandidates: ScanPaperCandidate[];
  datasetCandidates: Array<{
    id: string;
    kind: "dataset";
    title: string;
    variables: string;
    sampleSize?: string;
    source: "existing_data_claims";
  }>;
  summary: {
    knowledgeBasePapers: number;
    existingProjects: number;
    dataClaims: number;
  };
}

/** POST /api/directions/[slug]/parse-asset — 自然语言解析为结构化实验资产 */
export async function parseAssetFromNL(
  slug: string,
  text: string,
): Promise<{
  parsed: ExperimentAsset;
  confidence: "high" | "medium" | "low";
}> {
  const res = await fetch(`/api/directions/${slug}/parse-asset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({})) as {
    parsed?: ExperimentAsset;
    confidence?: "high" | "medium" | "low";
    error?: string;
  };
  if (!res.ok || !data.parsed) {
    throw new Error(data.error || "解析失败");
  }
  return {
    parsed: data.parsed,
    confidence: data.confidence || "medium",
  };
}

/** GET /api/directions/[slug]/scan — 从现有数据扫描候选资产 */
export async function scanCandidates(slug: string): Promise<ScanResult> {
  const res = await fetch(`/api/directions/${slug}/scan`);
  const data = await res.json().catch(() => ({})) as ScanResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "扫描候选资产失败");
  }
  return data;
}

// ==================== 预承诺 ====================

export interface EvaluationContractDraft {
  dimensions: Array<{
    id: string;
    name: string;
    weight: number;
    rubrics: Array<{
      id: string;
      what_to_look_for: string;
      what_triggers_block: string;
      what_triggers_warn: string;
      evidence_required: string;
    }>;
  }>;
}

/** POST /api/directions/[slug]/evaluation-contract (action=draft) — AI 生成评价标准草案 */
export async function generateContractDraft(slug: string): Promise<{
  draft: EvaluationContractDraft["dimensions"];
  generatedAt: number;
}> {
  const res = await fetch(`/api/directions/${slug}/evaluation-contract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "draft" }),
  });
  const data = await res.json().catch(() => ({})) as { draft?: EvaluationContractDraft["dimensions"]; error?: string; generatedAt?: number };
  if (!res.ok) {
    throw new Error(data.error || "生成评价标准失败");
  }
  return { draft: data.draft || [], generatedAt: data.generatedAt || Date.now() };
}

export interface EvaluationContractInput {
  dimensions: Array<{
    id: string;
    name?: string;
    weight?: number;
    rubrics?: Array<{
      id: string;
      what_to_look_for: string;
      what_triggers_block: string;
      what_triggers_warn: string;
      evidence_required: string;
    }>;
  }>;
}

export interface EvaluationContractDimension {
  id: string;
  name?: string;
  weight?: number;
  scoring_plan?: {
    dimension_id: string;
    what_to_look_for: string;
    what_triggers_block: string;
    what_triggers_warn: string;
  };
  rubrics?: Array<{
    id: string;
    what_to_look_for: string;
    what_triggers_block: string;
    what_triggers_warn: string;
    evidence_required: string;
  }>;
}

/** POST /api/directions/[slug]/evaluation-contract (action=socratic-draft) */
export async function generateSocraticContractDraft(
  slug: string,
  input: {
    qa: Array<{ questionId: string; question: string; answer: string }>;
    paraphrases: Record<string, string>;
  },
): Promise<{
  draft: EvaluationContractDimension[];
  rationale: string;
  sourceQuestions: string[];
  generatedAt: number;
}> {
  const res = await fetch(`/api/directions/${slug}/evaluation-contract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "socratic-draft",
      qa: input.qa,
      paraphrases: input.paraphrases,
    }),
  });
  const data = await res.json().catch(() => ({})) as {
    draft?: EvaluationContractDimension[];
    rationale?: string;
    sourceQuestions?: string[];
    generatedAt?: number;
    error?: string;
  };
  if (!res.ok || !data.draft) {
    throw new Error(data.error || "生成评价标准失败");
  }
  return {
    draft: data.draft,
    rationale: data.rationale || "",
    sourceQuestions: data.sourceQuestions || [],
    generatedAt: data.generatedAt || Date.now(),
  };
}

/** POST /api/directions/[slug]/evaluation-contract — 用户确认评价标准 */
export async function confirmContract(
  slug: string,
  input: EvaluationContractInput & { userParaphrases?: Record<string, string> },
): Promise<void> {
  const res = await fetch(`/api/directions/${slug}/evaluation-contract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "确认评价标准失败");
  }
}

// ==================== 8 维度分析 ====================

/** POST /api/directions/[slug]/analyze — 启动 SSE 分析流，返回 ReadableStream reader */
export async function startAnalysis(slug: string, mode: "full" | "quick" | "gap-only" = "full"): Promise<Response> {
  const res = await fetch(`/api/directions/${slug}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "启动分析失败");
  }
  return res;
}

// ==================== 路线图 ====================

export interface RoadmapResult {
  roadmap: {
    generatedAt: number;
    analysisSnapshotId: number;
    papers: Array<{
      candidateId: string;
      priority: number;
      status: "planned" | "writing" | "submitted" | "published";
      linkedProjectId?: string;
    }>;
    timeline: Array<{
      quarter: string;
      papers: string[];
    }>;
    experimentDependencies: Array<{
      description: string;
      requiredBy: string[];
      estimatedDuration: string;
    }>;
  };
  summary: string;
}

/** POST /api/directions/[slug]/roadmap — 生成论文路线图 */
export async function generateRoadmap(slug: string): Promise<RoadmapResult> {
  const res = await fetch(`/api/directions/${slug}/roadmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({})) as RoadmapResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "生成路线图失败");
  }
  return data;
}

// ==================== 实验方案生成 ====================

export interface ExperimentPlanResult {
  title: string;
  objective: string;
  rationale: string;
  methods: Array<{
    step: number;
    description: string;
    conditions: string;
    notes: string;
  }>;
  expectedResults: string;
  equipmentNeeded: string[];
  sampleRequirements: string;
  estimatedDuration: string;
  keyReferences: string[];
  generatedAt: number;
  gapDescription: string;
}

/** POST /api/directions/[slug]/experiment-plan — 生成实验方案 */
export async function generateExperimentPlan(
  slug: string,
  gap: string,
): Promise<{ plan: ExperimentPlanResult }> {
  const res = await fetch(`/api/directions/${slug}/experiment-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gap }),
  });
  const data = await res.json().catch(() => ({})) as { plan?: ExperimentPlanResult; error?: string };
  if (!res.ok || !data.plan) {
    throw new Error(data.error || "生成实验方案失败");
  }
  return { plan: data.plan };
}

// ==================== Phase 5: 桥接到写作 ====================

/** PATCH /api/directions/[slug]/roadmap — 更新单篇论文状态或确认路线图 */
export async function syncRoadmapPaper(
  slug: string,
  candidateId: string,
  updates: { status?: string; linkedProjectId?: string },
): Promise<void> {
  const res = await fetch(`/api/directions/${slug}/roadmap`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateId, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "同步路线图状态失败");
  }
}

/** PATCH /api/directions/[slug]/roadmap — 确认路线图 */
export async function confirmRoadmap(slug: string, summary?: string): Promise<void> {
  const res = await fetch(`/api/directions/${slug}/roadmap`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedAt: Date.now(), ...(summary ? { summary } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "确认路线图失败");
  }
}

export interface GrantProposalResult {
  title: string;
  sections: Array<{ heading: string; content: string }>;
  grantType: string;
  generatedAt: number;
}

/** POST /api/directions/[slug]/grant-proposal — 生成基金申请书 */
export async function generateGrantProposal(
  slug: string,
  grantType: "国自然面上" | "国自然青年" | "省基金" | "开放课题",
): Promise<GrantProposalResult> {
  const res = await fetch(`/api/directions/${slug}/grant-proposal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantType }),
  });
  const data = await res.json().catch(() => ({})) as { proposal?: GrantProposalResult; error?: string };
  if (!res.ok || !data.proposal) {
    throw new Error(data.error || "生成申请书失败");
  }
  return data.proposal;
}

import type { DirectionWritingContext } from "@/contracts/direction-writing-bridge";
import { requiredRefsToCitationList } from "@/contracts/direction-writing-bridge";
import {
  createInitialPaperPassport,
  paperConfigToRecord,
  serializePaperPassport,
} from "@/contracts/paper-passport";

/** 方向上下文：从路线图论文创建项目时带入的扩展信息 */
export interface RoadmapProjectContext {
  motivationFromGap?: string;
  dataBasis?: string[];
  targetJournal?: string;
  pendingExperiments?: string[];
  roadmapCandidateId?: string;
  /** 论文类型（覆盖 paperBrief 推断） */
  paperType?: "review" | "research";
  /** 目标字数范围，如 "8000-12000" */
  wordCount?: string;
  /** 写作语言（覆盖默认值） */
  language?: "zh" | "en";
  /** 引用格式（覆盖默认 gbt7714） */
  citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee";
}

/** GET /api/directions/[slug]/paper-brief — 获取论文简报（文献清单 + 上下文） */
export async function fetchPaperBrief(
  slug: string,
  candidateId?: string,
): Promise<DirectionWritingContext> {
  const url = new URL(`/api/directions/${slug}/paper-brief`, window.location.origin);
  if (candidateId) url.searchParams.set("candidateId", candidateId);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "获取论文简报失败");
  }
  return res.json();
}

/** 从路线图论文创建写作项目，带入方向上下文并生成蓝图 */
export async function createProjectFromRoadmap(
  paperTitle: string,
  directionSlug: string,
  candidateId?: string,
  context?: RoadmapProjectContext,
): Promise<{ projectId: string }> {
  // 0. 获取论文简报（文献清单 + 上下文）
  let paperBrief: DirectionWritingContext | null = null;
  try {
    paperBrief = await fetchPaperBrief(directionSlug, candidateId);
  } catch {
    // 简报获取失败不阻塞项目创建，退回到无文献清单模式
  }

  const paperType = context?.paperType || paperBrief?.paperType || "review";
  const language = context?.language || "zh";
  const citationStyle = context?.citationStyle || "gbt7714";
  const wordCount = context?.wordCount || "";
  const suggestedJournal = paperBrief?.suggestedJournal || context?.targetJournal;

  // 1. 创建项目（带入完整配置 + PaperPassport）
  const paperPassport = serializePaperPassport(
    createInitialPaperPassport(
      paperConfigToRecord({
        paperTitle,
        paperType,
        targetJournal: context?.targetJournal || suggestedJournal || "",
        wordCount,
        language,
        citationStyle,
      }),
      {
        directionSlug,
        candidateId,
        linkedAt: Date.now(),
      },
    ),
  );

  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: paperTitle,
      researchDirection: directionSlug,
      mode: paperType,
      language,
      citationStyle,
      paperPassport,
    }),
  });
  const createData = await createRes.json().catch(() => ({})) as { id?: string; error?: string };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error || "创建项目失败");
  }

  // 2. 导入文献清单到项目 references
  if (paperBrief && paperBrief.requiredReferences.length > 0) {
    try {
      const citations = requiredRefsToCitationList(paperBrief.requiredReferences);
      const ops = citations.map((citation, i) => ({
        op: "create" as const,
        content: citation,
        index: i,
      }));
      await fetch(`/api/projects/${createData.id}/references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      });
    } catch {
      // 文献导入失败不阻塞项目创建
    }
  }

  // 3. 生成写作蓝图（带入完整 direction 上下文 + 写作配置）
  try {
    const motivationText = [
      context?.motivationFromGap || paperBrief?.motivationFromGap || "",
      wordCount ? `目标字数：${wordCount}` : "",
    ].filter(Boolean).join("；");

    await fetch("/api/outline/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: createData.id,
        title: paperTitle,
        researchDirection: directionSlug,
        motivationFromGap: motivationText || undefined,
        dataBasis: context?.dataBasis || undefined,
        targetJournal: suggestedJournal || undefined,
        pendingExperiments:
          context?.pendingExperiments || paperBrief?.pendingExperiments || undefined,
        roadmapCandidateId: context?.roadmapCandidateId || candidateId || undefined,
      }),
    });
  } catch {
    // 蓝图生成失败不阻塞项目创建
  }

  // 4. 重算 PaperPassport 阶段进度
  try {
    await fetch(`/api/projects/${createData.id}/paper-passport/sync`, { method: "POST" });
  } catch {
    // 非阻塞
  }

  // 5. 同步路线图状态
  if (candidateId) {
    try {
      await syncRoadmapPaper(directionSlug, candidateId, {
        status: "writing",
        linkedProjectId: createData.id,
      });
    } catch {
      // 同步失败不阻塞项目创建
    }
  }

  return { projectId: createData.id };
}

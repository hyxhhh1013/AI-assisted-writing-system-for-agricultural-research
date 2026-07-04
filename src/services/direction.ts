/** 研究方向 API 服务封装 */

import type {
  DirectionDTO,
  DirectionListItem,
  DirectionAsset,
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
    throw new Error(data.error || "获取方向失败");
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

/** POST /api/directions/[slug]/evaluation-contract — 用户确认评价标准 */
export async function confirmContract(slug: string, input: EvaluationContractInput): Promise<void> {
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

// ==================== Phase 5: 桥接到写作 ====================

/** PATCH /api/directions/[slug]/roadmap — 更新单篇论文状态 */
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

/** 方向上下文：从路线图论文创建项目时带入的扩展信息 */
export interface RoadmapProjectContext {
  motivationFromGap?: string;
  dataBasis?: string[];
  targetJournal?: string;
  pendingExperiments?: string[];
  roadmapCandidateId?: string;
}

/** 从路线图论文创建写作项目，带入方向上下文并生成蓝图 */
export async function createProjectFromRoadmap(
  paperTitle: string,
  directionSlug: string,
  candidateId?: string,
  context?: RoadmapProjectContext,
): Promise<{ projectId: string }> {
  // 1. 创建项目（带入方向上下文）
  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: paperTitle,
      researchDirection: directionSlug,
      mode: "research",
      language: "zh",
    }),
  });
  const createData = await createRes.json().catch(() => ({})) as { id?: string; error?: string };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error || "创建项目失败");
  }

  // 2. 生成写作蓝图（带入方向上下文）
  try {
    await fetch("/api/outline/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: createData.id,
        title: paperTitle,
        ...(context ? {
          researchDirection: directionSlug,
          motivationFromGap: context.motivationFromGap || undefined,
          dataBasis: context.dataBasis || undefined,
          targetJournal: context.targetJournal || undefined,
          pendingExperiments: context.pendingExperiments || undefined,
          roadmapCandidateId: context.roadmapCandidateId || undefined,
        } : {}),
      }),
    });
  } catch {
    // 蓝图生成失败不阻塞项目创建
  }

  // 3. 同步路线图状态
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

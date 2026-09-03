/**
 * 配图闭环：出图 → 强制 read_figure(qa) → 不合格必须 replaceImageUrl 重画。
 * 纯函数 + 轻量决策，供 toolsNode / 门禁 / 工具内防叠图使用。
 */
import type { AgentToolResult } from "@/contracts/agent";
import type { ProjectChartAsset } from "@/contracts/figure";
import { parseFigureQaVerdict } from "@/lib/agent/figure-qa";
import type { LLMMessage, ParsedToolCall, ToolObservation } from "@/lib/agent/types";
import { randomUUID } from "crypto";

export const FIGURE_GENERATE_TOOLS = new Set([
  "draft_mechanism_figure",
  "generate_chart",
]);

/** 仅这些出图工具自动排队视觉识图 QA（FIG-QA-008） */
export const FIGURE_VISION_QA_TOOLS = new Set(["draft_mechanism_figure"]);

const SCHEMATIC_FIGURE_IDS = new Set([
  "flow",
  "mechanism_panel",
  "mechanism",
  "mol",
  "molecule",
  "mermaid",
]);

export function isSchematicFigureId(figureId: string | undefined | null): boolean {
  if (!figureId) return false;
  return SCHEMATIC_FIGURE_IDS.has(figureId.trim());
}

export function shouldInjectVisionFigureQa(toolName: string): boolean {
  return FIGURE_VISION_QA_TOOLS.has(toolName);
}

export function isChartQaBlocked(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { blocked?: unknown; qaReport?: { verdict?: unknown } };
  return d.blocked === true || d.qaReport?.verdict === "block";
}

export const FIGURE_BRIEF_QUESTION =
  "出机理图/概念图前请确认（可直接回复选项字母或简短说明）：\n"
  + "1) 版式：A 单栏流程  B 多面板 a/b/c\n"
  + "2) 配色：nature（通用）/ agr_journal（农科绿）/ print_bw（黑白）\n"
  + "3) 是否需要分子式/化学结构标注（要/不要）\n"
  + "4) 是否已有素材图要嵌入（无 / 有，稍后上传）\n"
  + "5) 其他个性化要求（一句话）。\n"
  + "确认后我会按你的选择出「可编辑草稿」，复杂终稿可在绘图页精修。";

/** 从出图工具结果提取 imageUrl */
export function extractFigureImageUrl(result: AgentToolResult): string | null {
  if (!result.success || result.data == null || typeof result.data !== "object") {
    return null;
  }
  const data = result.data as Record<string, unknown>;
  if (typeof data.imageUrl === "string" && data.imageUrl.startsWith("/api/charts/")) {
    return data.imageUrl;
  }
  // 批量：取第一张
  if (Array.isArray(data.charts) && data.charts[0] && typeof data.charts[0] === "object") {
    const first = data.charts[0] as Record<string, unknown>;
    if (typeof first.imageUrl === "string" && first.imageUrl.startsWith("/api/charts/")) {
      return first.imageUrl;
    }
  }
  return null;
}

export function extractFigureHref(result: AgentToolResult): string | null {
  if (!result.success || result.data == null || typeof result.data !== "object") {
    return null;
  }
  const href = (result.data as { href?: unknown }).href;
  return typeof href === "string" && href.startsWith("/plot") ? href : null;
}

export function extractFigureTitle(result: AgentToolResult, params: Record<string, unknown>): string {
  if (result.data && typeof result.data === "object") {
    const t = (result.data as { title?: unknown; caption?: unknown }).title
      ?? (result.data as { caption?: unknown }).caption;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  const p = params.title ?? params.caption;
  return typeof p === "string" ? p.trim() : "";
}

/** 出图成功后注入的强制识图调用 */
export function buildReadFigureQaCall(imageUrl: string): ParsedToolCall {
  return {
    id: `fig_qa_${randomUUID().slice(0, 8)}`,
    name: "read_figure",
    args: { imageUrl, mode: "qa" },
  };
}

export function isFigureQaNeedsRegen(result: AgentToolResult): boolean {
  if (!result.success || result.data == null || typeof result.data !== "object") {
    return false;
  }
  const data = result.data as {
    needsRegen?: unknown;
    description?: unknown;
    mode?: unknown;
    qaVerdict?: unknown;
  };
  if (data.needsRegen === true || data.qaVerdict === "regen") return true;
  if (data.mode === "qa" && typeof data.description === "string") {
    return parseFigureQaVerdict(data.description).needsRegen;
  }
  return false;
}

/** 「可接受·建议精修」：不强制重画，引导 /plot */
export function isFigureQaNeedsPolish(result: AgentToolResult): boolean {
  if (!result.success || result.data == null || typeof result.data !== "object") {
    return false;
  }
  if (isFigureQaNeedsRegen(result)) return false;
  const data = result.data as {
    needsPolish?: unknown;
    description?: unknown;
    mode?: unknown;
    qaVerdict?: unknown;
  };
  if (data.needsPolish === true || data.qaVerdict === "polish") return true;
  if (data.mode === "qa" && typeof data.description === "string") {
    return parseFigureQaVerdict(data.description).needsPolish;
  }
  return false;
}

/** 最近一次 read_figure(qa) 是否要求重生成（且其后尚未成功 replace 出图） */
export function lastFigureQaNeedsReplace(
  observations: readonly ToolObservation[],
): { imageUrl: string } | null {
  for (let i = observations.length - 1; i >= 0; i--) {
    const o = observations[i];
    if (!o) continue;
    if (FIGURE_GENERATE_TOOLS.has(o.tool) && o.success) {
      if (
        (o.tool === "generate_chart" || o.tool === "draft_mechanism_figure")
        && isChartQaBlocked(o.data)
      ) {
        const url =
          typeof o.data === "object" && o.data && "imageUrl" in o.data
            && typeof (o.data as { imageUrl?: unknown }).imageUrl === "string"
            ? (o.data as { imageUrl: string }).imageUrl
            : "";
        return url ? { imageUrl: url } : null;
      }
      // 出图成功（数据图过线 / 机理图已画）视为已响应过一次 qa
      return null;
    }
    if (o.tool === "read_figure" && o.success && o.data && typeof o.data === "object") {
      const data = o.data as {
        needsRegen?: unknown;
        imageUrl?: unknown;
        mode?: unknown;
        description?: unknown;
        qaVerdict?: unknown;
      };
      const needs =
        data.needsRegen === true
        || data.qaVerdict === "regen"
        || (typeof data.description === "string"
          && parseFigureQaVerdict(data.description).needsRegen);
      if (needs && typeof data.imageUrl === "string" && data.imageUrl) {
        return { imageUrl: data.imageUrl };
      }
      return null;
    }
  }
  return null;
}

/**
 * 防叠图：同标题或同 section 已有图且未传 replace → 自动补 replaceImageUrl，
 * 或在找不到资产时返回应拒绝的错误。
 */
export function resolveReplaceForAntiStack(input: {
  params: Record<string, unknown>;
  charts: ProjectChartAsset[];
}): { params: Record<string, unknown>; autoReplaced: boolean; error?: string } {
  const params = { ...input.params };
  const hasReplace =
    Boolean(String(params.replaceImageUrl ?? "").trim())
    || Boolean(String(params.replaceChartId ?? "").trim());
  if (hasReplace) return { params, autoReplaced: false };

  const title = String(params.title ?? params.caption ?? "").trim();
  const sectionKey = String(params.sectionKey ?? "").trim();
  if (!title && !sectionKey) return { params, autoReplaced: false };

  const candidates = input.charts.filter((c) => {
    const cap = (c.caption ?? "").trim();
    const sec = (c.sectionKey ?? "").trim();
    if (title && cap && (cap === title || cap.includes(title) || title.includes(cap))) {
      return true;
    }
    if (sectionKey && sec === sectionKey && /mechanism|flow|panel/i.test(c.figureId ?? "")) {
      return true;
    }
    return false;
  });
  if (candidates.length === 0) return { params, autoReplaced: false };

  const latest = candidates.reduce((a, b) =>
    (a.createdAt ?? 0) >= (b.createdAt ?? 0) ? a : b,
  );
  params.replaceImageUrl = latest.imageUrl;
  if (latest.id) params.replaceChartId = latest.id;
  if (!params.sectionKey && latest.sectionKey) {
    params.sectionKey = latest.sectionKey;
  }
  return { params, autoReplaced: true };
}

/** 质检失败后禁止无 replace 再出图 */
export function checkFigureReplaceRequired(input: {
  toolName: string;
  params: Record<string, unknown>;
  observations: readonly ToolObservation[];
}): { ok: true } | { ok: false; error: string } {
  if (!FIGURE_GENERATE_TOOLS.has(input.toolName)) return { ok: true };
  const pending = lastFigureQaNeedsReplace(input.observations);
  if (!pending) return { ok: true };
  const replaceUrl = String(input.params.replaceImageUrl ?? "").trim();
  const replaceId = String(input.params.replaceChartId ?? "").trim();
  if (replaceUrl || replaceId) return { ok: true };
  return {
    ok: false,
    error:
      `上一张图质检未通过，重画必须传 replaceImageUrl="${pending.imageUrl}" 就地替换，`
      + "禁止再追加一张叠在旧图下面。也可先 remove_figure 删旧图。",
  };
}

/** QA 未通过且模型试图空口收尾时注入的硬续跑提示 */
export function buildFigureQaContinueNudge(imageUrl: string): string {
  return (
    "System: 上一张图质量未过线，禁止只写分析就收尾。"
    + `请立刻重出并传 replaceImageUrl="${imageUrl}" 就地替换。`
    + "数据图按 qaReport findings 改 Spec；机理图按识图意见改结构。不要再 append，也不要长篇推演。"
  );
}

export function extractChartQaFindingCodes(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const report = (data as { qaReport?: { findings?: unknown } }).qaReport;
  if (!report || !Array.isArray(report.findings)) return [];
  const codes: string[] = [];
  for (const item of report.findings) {
    if (!item || typeof item !== "object") continue;
    const f = item as { action?: unknown; code?: unknown };
    if (f.action === "block" && typeof f.code === "string" && f.code) {
      codes.push(f.code);
    }
  }
  return codes;
}

export function buildChartQaBlockNudge(imageUrl: string, codes: string[]): string {
  const list = codes.length ? codes.join("、") : "见 qaReport.findings";
  return (
    "System: 数据图 qaReport.verdict=block，禁止只写分析就收尾。"
    + `缺陷：${list}。请按 findings 改轴标签/单位/显著性下标后重出`
    + (imageUrl ? `（可带 replaceImageUrl="${imageUrl}"）` : "")
    + "。不要对柱状/折线/热力等数据图调用 read_figure(mode=qa)。"
  );
}

export function buildMechanismQaBlockNudge(codes: string[]): string {
  const list = codes.length ? codes.join("、") : "见 qaReport.findings";
  return (
    "System: 机理图 qaReport.verdict=block，未入库。禁止只写分析就收尾。"
    + `缺陷：${list}。请按 findings 改节点短语、边上条件或去掉英文占位后重出。`
    + "不要整图重掷，也不要改用文生图。"
  );
}

/** 从一批工具结果里收集需重生成的 imageUrl（并行 read_figure 用） */
export function collectFigureQaFailures(
  observations: readonly ToolObservation[],
): string[] {
  const urls: string[] = [];
  for (const o of observations) {
    if (o.tool !== "read_figure" || !o.success || !o.data || typeof o.data !== "object") {
      continue;
    }
    const data = o.data as {
      needsRegen?: unknown;
      imageUrl?: unknown;
      description?: unknown;
      qaVerdict?: unknown;
    };
    const needs =
      data.needsRegen === true
      || data.qaVerdict === "regen"
      || (typeof data.description === "string"
        && parseFigureQaVerdict(data.description).needsRegen);
    if (needs && typeof data.imageUrl === "string" && data.imageUrl) {
      urls.push(data.imageUrl);
    }
  }
  return urls;
}

export function isMultiFigureGoal(goal: string): boolean {
  const g = goal.trim();
  if (!g) return false;
  return /几张图|多张图|重新画|重画|机理图|示意图|概念框架|配图|作图|流程图/.test(g)
    || /图\s*\d|图[一二三四五六七八九十]/.test(g);
}

export function hasFigureBriefAnswer(messages: readonly LLMMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "user"
      && typeof m.content === "string"
      && m.content.includes("【用户回答】"),
  );
}

export function shouldPauseForFigureBrief(input: {
  toolName: string;
  params: Record<string, unknown>;
  goal: string;
  messages: readonly LLMMessage[];
}): boolean {
  if (input.toolName !== "draft_mechanism_figure") return false;
  if (String(input.params.figureBriefConfirmed ?? "").toLowerCase() === "true") {
    return false;
  }
  if (String(input.params.skipFigureBrief ?? "").toLowerCase() === "true") {
    return false;
  }
  if (!isMultiFigureGoal(input.goal)) return false;
  if (hasFigureBriefAnswer(input.messages)) return false;
  return true;
}

/** 农科机理常用模板：提升草稿下限（节点/边已是中文分叉结构） */
export type MechanismTemplateId =
  | "pyrolysis_framework"
  | "deoxygenation_paths"
  | "dual_site_catalyst"
  | "multiproduct_carbon";

export const MECHANISM_TEMPLATES: Record<
  MechanismTemplateId,
  {
    label: string;
    kind: "flow" | "mechanism_panel";
    title: string;
    flowSteps?: string[];
    panels?: Array<{ title: string; steps: string[]; bullets?: string[] }>;
    pathwayNotes?: string;
  }
> = {
  pyrolysis_framework: {
    label: "生物质催化热解定向调控框架",
    kind: "flow",
    title: "生物质催化热解高值产物定向调控概念框架图",
    flowSteps: [
      "生物质原料（秸秆/林余/废塑料）",
      "催化热解（约500℃，原位/异位）",
      "酸位/金属位/双功能位调控",
      "碳流定向分配（条件+反应器）",
      "生物油·合成气·碳纳米材料",
    ],
    pathwayNotes: "反应条件与反应器构型协同决定碳流分配。",
  },
  deoxygenation_paths: {
    label: "生物油脱氧/芳构化多面板",
    kind: "mechanism_panel",
    title: "生物油定向提质中的脱氧路径与芳构化调控机制示意图",
    panels: [
      {
        title: "脱氧路径：脱水/脱羧/脱羰",
        steps: ["含氧前体", "脱水", "脱羧", "脱羰", "脱氧产物"],
        bullets: ["分子筛酸位主导"],
      },
      {
        title: "芳构化与择形调控",
        steps: ["烯烃中间体", "环化", "氢转移", "芳烃"],
        bullets: ["孔道择形+金属位"],
      },
      {
        title: "碱性添加剂脱酸",
        steps: ["酸性组分", "CaO等碱位中和", "低酸值油品"],
        bullets: ["降低油品酸值"],
      },
    ],
    pathwayNotes: "金属改性（Zn/Ga等）可提升芳构化选择性；碱性添加剂协同脱酸。",
  },
  dual_site_catalyst: {
    label: "金属-酸碱双功能位协同",
    kind: "flow",
    title: "金属-酸碱双功能催化剂协同转化示意图",
    flowSteps: [
      "反应物吸附",
      "金属位活化/氢解",
      "酸位裂化·异构",
      "碱位脱酸/缩合",
      "目标产物脱附",
    ],
  },
  multiproduct_carbon: {
    label: "多产物联产催化剂共性设计",
    kind: "flow",
    title: "多产物联产中的催化剂共性设计框架图",
    flowSteps: [
      "设计要素：酸位·金属位·孔结构",
      "金属-酸碱双功能协同",
      "条件与反应器匹配（原位/异位）",
      "碳流选择性分配",
      "生物油·合成气·碳材料协同调控",
    ],
  },
};

export function listMechanismTemplateIds(): MechanismTemplateId[] {
  return Object.keys(MECHANISM_TEMPLATES) as MechanismTemplateId[];
}

export function getMechanismTemplate(
  id: string,
): (typeof MECHANISM_TEMPLATES)[MechanismTemplateId] | null {
  if (id in MECHANISM_TEMPLATES) {
    return MECHANISM_TEMPLATES[id as MechanismTemplateId];
  }
  return null;
}

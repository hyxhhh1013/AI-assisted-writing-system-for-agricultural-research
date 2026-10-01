import type { ProjectChartAsset } from "@/contracts/figure";
import {
  insertOrReplaceAgentSectionImage,
  listAgentCharts,
  persistAgentChart,
} from "@/lib/agent/chart-persist";
import {
  formatInsertSummary,
  resolveInsertSectionKey,
  verifySectionContains,
} from "@/lib/agent/insert-section";
import { runMechanismIllustration } from "@/lib/illustration-runner";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const illustrateMechanismFigureTool: ToolDefinition = {
  name: "illustrate_mechanism_figure",
  description:
    "在 Graphviz 结构草稿之上用即梦 Seedream（智谱备选）出观感候选。"
    + "action=generate 默认且禁止插入正文，等人选图；"
    + "action=adopt 才把候选写入图表库并替换/插入章节。"
    + "不可替代 draft_mechanism_figure，也不可用于数据柱状/折线图。",
  safety: "write",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "generate（默认，出候选不插正文）或 adopt（采用候选并插入）",
        enum: ["generate", "adopt"],
      },
      sourceImageUrl: {
        type: "string",
        description: "结构草稿 PNG，必须是 /api/charts/…（generate 必填）",
      },
      sourceChartId: {
        type: "string",
        description: "结构图在 Project.charts 中的 id（可选）",
      },
      candidateImageUrl: {
        type: "string",
        description: "adopt 时选用的候选 /api/charts/ URL",
      },
      caption: {
        type: "string",
        description: "图题（可选）",
      },
      claim: {
        type: "string",
        description: "科学主张（可选，不画进新框）",
      },
      promptOverride: {
        type: "string",
        description: "覆盖编译提示词（少用）",
      },
      mechanismSpecJson: {
        type: "string",
        description: "MechanismSpecV1 JSON 字符串",
      },
      sectionKey: {
        type: "string",
        description: "adopt 插入章节；省略则推断 results/methods",
      },
      replaceImageUrl: {
        type: "string",
        description: "adopt 时就地替换正文中的旧图 URL，默认结构草稿 URL",
      },
    },
    required: [],
  },
  execute: async (params, ctx: AgentContext) => {
    if (!ctx.projectId) {
      return { success: false, error: "illustrate_mechanism_figure 需要关联 projectId" };
    }
    const action = asString(params.action) === "adopt" ? "adopt" : "generate";
    if (action === "generate") {
      return executeGenerate(params, ctx);
    }
    return executeAdopt(params, ctx);
  },
};

async function executeGenerate(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ success: boolean; summary?: string; error?: string; data?: unknown }> {
  const sourceImageUrl = asString(params.sourceImageUrl);
  if (!sourceImageUrl.startsWith("/api/charts/")) {
    return { success: false, error: "generate 需要 sourceImageUrl=/api/charts/…" };
  }

  let mechanismSpec: unknown;
  const specRaw = asString(params.mechanismSpecJson);
  if (specRaw) {
    try {
      mechanismSpec = JSON.parse(specRaw) as unknown;
    } catch {
      return { success: false, error: "mechanismSpecJson 不是合法 JSON" };
    }
  }

  const charts = await listAgentCharts(ctx.projectId!);
  const source = findChart(charts, asString(params.sourceChartId), sourceImageUrl);

  try {
    const run = await runMechanismIllustration({
      sourceImageUrl,
      caption: asString(params.caption) || source?.caption,
      claim: asString(params.claim),
      mechanismSpec,
      figureSpecEnc: source?.figureSpecEnc,
      promptOverride: asString(params.promptOverride) || undefined,
    });
    const first = run.candidates[0];
    return {
      success: true,
      summary:
        `已用${run.providerUsed === "seedream" ? "即梦 Seedream" : "智谱"}生成 ${run.candidates.length} 张示意候选（未插入正文）。`
        + (run.fallback ? " Seedream 失败已改智谱。" : "")
        + "请用户在配图坞选用后再 adopt。",
      data: {
        action: "generate",
        persisted: false,
        needsHumanPick: true,
        providerUsed: run.providerUsed,
        fallback: run.fallback,
        sourceImageUrl: run.sourceImageUrl,
        imageUrl: first?.imageUrl,
        candidates: run.candidates,
        prompt: run.prompt,
        figureSpecEnc: source?.figureSpecEnc,
        caption: source?.caption,
        sectionKey: source?.sectionKey,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "示意生成失败",
    };
  }
}

async function executeAdopt(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ success: boolean; summary?: string; error?: string; data?: unknown }> {
  const candidateImageUrl = asString(params.candidateImageUrl);
  if (!candidateImageUrl.startsWith("/api/charts/")) {
    return { success: false, error: "adopt 需要 candidateImageUrl=/api/charts/…" };
  }

  const charts = await listAgentCharts(ctx.projectId!);
  const sourceImageUrl = asString(params.sourceImageUrl) || asString(params.replaceImageUrl);
  const source = findChart(charts, asString(params.sourceChartId), sourceImageUrl);

  const resolved = resolveInsertSectionKey(params.sectionKey, ctx.projectSnapshot);
  if ("error" in resolved) {
    return { success: false, error: resolved.error };
  }
  const sectionKey = resolved.sectionKey ?? source?.sectionKey;
  if (!sectionKey) {
    return { success: false, error: "adopt 需要 sectionKey 或已有结构图章节" };
  }

  const caption =
    asString(params.caption)
    || (source?.caption ? `${source.caption}（示意）` : "机理示意图");
  const replaceImageUrl =
    asString(params.replaceImageUrl) || source?.imageUrl || sourceImageUrl;

  const ins = await insertOrReplaceAgentSectionImage(ctx.userId, ctx.projectId!, {
    sectionKey,
    caption,
    imageUrl: candidateImageUrl,
    replaceImageUrl: replaceImageUrl || undefined,
  });
  const seen = await verifySectionContains(ctx.projectId!, sectionKey, candidateImageUrl);

  let persisted: ProjectChartAsset | null = null;
  try {
    persisted = await persistAgentChart(ctx.userId, ctx.projectId!, {
      figureId: source?.figureId || "flow",
      caption,
      imageUrl: candidateImageUrl,
      sectionKey,
      figureSpecEnc: source?.figureSpecEnc,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "采用写入图表库失败",
    };
  }

  return {
    success: true,
    summary:
      `已采用示意候选并${ins.mode === "replaced" ? "替换" : "插入"}「${sectionKey}」。`
      + formatInsertSummary({
        inferred: resolved.inferred,
        insertedSection: sectionKey,
        verifiedInBody: seen.verifiedInBody,
      }),
    data: {
      action: "adopt",
      persisted,
      imageUrl: candidateImageUrl,
      sourceImageUrl: source?.imageUrl ?? sourceImageUrl,
      insertedSection: sectionKey,
      insertMode: ins.mode,
      verifiedInBody: seen.verifiedInBody,
      bodyExcerpt: seen.bodyExcerpt,
      inferredSection: resolved.inferred,
      figureSpecEnc: source?.figureSpecEnc,
    },
  };
}

function findChart(
  charts: ProjectChartAsset[],
  chartId: string,
  imageUrl: string,
): ProjectChartAsset | null {
  if (chartId) {
    return charts.find((c) => c.id === chartId) ?? null;
  }
  if (imageUrl) {
    const hits = charts.filter((c) => c.imageUrl === imageUrl);
    return hits[hits.length - 1] ?? null;
  }
  return null;
}

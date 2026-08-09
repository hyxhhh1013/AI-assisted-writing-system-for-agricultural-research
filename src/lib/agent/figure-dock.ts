import type { AgentUiMessage } from "@/contracts/agent-session";
import {
  buildAgentPlotRefineHref,
  chartAssetToPlotHref,
  type ProjectChartAsset,
} from "@/contracts/figure";
import type { FigureReviseTarget } from "@/contracts/figure-revise";

export type FigureDockItem = FigureReviseTarget & {
  id: string;
  /** 来源：会话 observation / 项目图表库 */
  source: "session" | "project";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 从 observation.data 拼回 /plot 精修深链（缺 plotHref 时兜底） */
export function resolvePlotHrefFromObservation(
  m: Extract<AgentUiMessage, { kind: "observation" }>,
  projectId?: string,
): string | undefined {
  if (m.plotHref?.startsWith("/plot")) return m.plotHref;
  if (!projectId) return undefined;
  const data = isRecord(m.data) ? m.data : null;
  if (!data) return undefined;

  const figureSpecEnc =
    typeof data.figureSpecEnc === "string" && data.figureSpecEnc
      ? data.figureSpecEnc
      : undefined;
  const persisted = isRecord(data.persisted) ? data.persisted : null;
  const chartAssetId =
    persisted && typeof persisted.id === "string" ? persisted.id : undefined;
  const figureId =
    (typeof data.figureId === "string" && data.figureId)
    || (typeof data.chartType === "string" && data.chartType)
    || (typeof data.kind === "string" && data.kind === "mechanism_panel"
      ? "mechanism_panel"
      : typeof data.kind === "string" && data.kind === "flow"
        ? "flow"
        : typeof data.kind === "string" && data.kind === "mechanism"
          ? "mechanism"
          : undefined)
    || (persisted && typeof persisted.figureId === "string"
      ? persisted.figureId
      : undefined)
    || "flow";

  if (!figureSpecEnc && !chartAssetId) {
    const href = data.href;
    return typeof href === "string" && href.startsWith("/plot") ? href : undefined;
  }

  return buildAgentPlotRefineHref({
    projectId,
    figureId,
    figureSpecEnc,
    chartAssetId: figureSpecEnc ? chartAssetId : undefined,
    imageUrl: m.imageUrl,
  });
}

/** 从对话里收集最近出图（新→旧去重 by imageUrl） */
export function collectSessionFigureDockItems(
  messages: readonly AgentUiMessage[],
  limit = 6,
  projectId?: string,
): FigureDockItem[] {
  const out: FigureDockItem[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.kind !== "observation") continue;
    if (m.tool !== "draft_mechanism_figure" && m.tool !== "generate_chart") continue;
    if (m.error || !m.imageUrl) continue;
    const title =
      m.summary?.match(/「([^」]+)」/)?.[1]
      || (typeof (m.data as { title?: unknown } | undefined)?.title === "string"
        ? String((m.data as { title: string }).title)
        : undefined);
    const plotHref = resolvePlotHrefFromObservation(m, projectId);
    if (seen.has(m.imageUrl)) {
      // 同 URL：用较早 observation 补全标题/章节等（最新一条可能只有缩略图）
      const hit = out.find((x) => x.imageUrl === m.imageUrl);
      if (hit) {
        if (!hit.title && title) hit.title = title;
        if (!hit.sectionKey && m.sectionKey) hit.sectionKey = m.sectionKey;
        if (!hit.insertMode && m.insertMode) hit.insertMode = m.insertMode;
        if (!hit.plotHref && plotHref) hit.plotHref = plotHref;
        if (!hit.replaceImageUrl) hit.replaceImageUrl = m.replaceImageUrl ?? m.imageUrl;
      }
      continue;
    }
    seen.add(m.imageUrl);
    out.push({
      id: `session:${m.imageUrl}`,
      source: "session",
      imageUrl: m.imageUrl,
      replaceImageUrl: m.replaceImageUrl ?? m.imageUrl,
      title,
      sectionKey: m.sectionKey,
      insertMode: m.insertMode,
      plotHref,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 合并项目图表库（补全会话未带 section 的项；不重复 URL） */
export function mergeProjectChartsIntoDock(
  sessionItems: FigureDockItem[],
  charts: ProjectChartAsset[],
  limit = 6,
  projectId?: string,
): FigureDockItem[] {
  const seen = new Set(sessionItems.map((x) => x.imageUrl));
  const merged = [...sessionItems];
  const sorted = [...charts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  for (const c of sorted) {
    if (!c.imageUrl?.startsWith("/api/charts/")) continue;
    const assetHref =
      projectId && c.figureSpecEnc
        ? chartAssetToPlotHref(projectId, c)
        : projectId
          ? buildAgentPlotRefineHref({
              projectId,
              figureId: c.figureId,
              imageUrl: c.imageUrl,
            })
          : undefined;
    if (seen.has(c.imageUrl)) {
      // 用资产补全 section / title / plotHref
      const hit = merged.find((x) => x.imageUrl === c.imageUrl);
      if (hit) {
        if (!hit.sectionKey && c.sectionKey) hit.sectionKey = c.sectionKey;
        if (!hit.title && c.caption) hit.title = c.caption;
        if (!hit.plotHref && assetHref) hit.plotHref = assetHref;
      }
      continue;
    }
    seen.add(c.imageUrl);
    merged.push({
      id: `project:${c.id}`,
      source: "project",
      imageUrl: c.imageUrl,
      replaceImageUrl: c.imageUrl,
      title: c.caption,
      sectionKey: c.sectionKey,
      insertMode: c.sectionKey ? "appended" : undefined,
      plotHref: assetHref,
    });
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}

/** 给 /plot 深链补上 replaceImageUrl，便于精修后就地替换 */
export function withReplaceImageUrlParam(
  href: string | undefined,
  imageUrl: string,
): string | undefined {
  if (!href?.startsWith("/plot")) return href;
  try {
    const u = new URL(href, "http://local.invalid");
    if (!u.searchParams.get("replaceImageUrl")) {
      u.searchParams.set("replaceImageUrl", imageUrl);
    }
    return `${u.pathname}?${u.searchParams.toString()}`;
  } catch {
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}replaceImageUrl=${encodeURIComponent(imageUrl)}`;
  }
}

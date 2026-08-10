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
  /** 精修回放快照（点击时写入 sessionStorage） */
  figureSpecEnc?: string;
  chartAssetId?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hrefHasChartAssetId(href: string): boolean {
  return /[?&]chartAssetId=/.test(href);
}

/** 从 observation.data 拼回 /plot 精修深链（缺 plotHref 或仅有易截断 figureSpec 时兜底） */
export function resolvePlotHrefFromObservation(
  m: Extract<AgentUiMessage, { kind: "observation" }>,
  projectId?: string,
): string | undefined {
  const data = isRecord(m.data) ? m.data : null;
  const figureSpecEnc =
    data && typeof data.figureSpecEnc === "string" && data.figureSpecEnc
      ? data.figureSpecEnc
      : undefined;
  const persisted = data && isRecord(data.persisted) ? data.persisted : null;
  const chartAssetId =
    persisted && typeof persisted.id === "string" ? persisted.id : undefined;

  // 已有 chartAssetId 的深链最稳，直接用
  if (m.plotHref?.startsWith("/plot") && hrefHasChartAssetId(m.plotHref)) {
    return m.plotHref;
  }

  if (projectId && (figureSpecEnc || chartAssetId)) {
    const figureId =
      (data && typeof data.figureId === "string" && data.figureId)
      || (data && typeof data.chartType === "string" && data.chartType)
      || (data && typeof data.kind === "string" && data.kind === "mechanism_panel"
        ? "mechanism_panel"
        : data && typeof data.kind === "string" && data.kind === "flow"
          ? "flow"
          : data && typeof data.kind === "string" && data.kind === "mechanism"
            ? "mechanism"
            : undefined)
      || (persisted && typeof persisted.figureId === "string"
        ? persisted.figureId
        : undefined)
      || "flow";
    return buildAgentPlotRefineHref({
      projectId,
      figureId,
      figureSpecEnc,
      chartAssetId: figureSpecEnc ? chartAssetId : undefined,
      imageUrl: m.imageUrl,
    });
  }

  if (m.plotHref?.startsWith("/plot")) return m.plotHref;
  if (data && typeof data.href === "string" && data.href.startsWith("/plot")) {
    return data.href;
  }
  return undefined;
}

function extractReplayMeta(m: Extract<AgentUiMessage, { kind: "observation" }>): {
  figureSpecEnc?: string;
  chartAssetId?: string;
} {
  const data = isRecord(m.data) ? m.data : null;
  if (!data) return {};
  const figureSpecEnc =
    typeof data.figureSpecEnc === "string" && data.figureSpecEnc
      ? data.figureSpecEnc
      : undefined;
  const persisted = isRecord(data.persisted) ? data.persisted : null;
  const chartAssetId =
    persisted && typeof persisted.id === "string" ? persisted.id : undefined;
  return { figureSpecEnc, chartAssetId };
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
    const replay = extractReplayMeta(m);
    if (seen.has(m.imageUrl)) {
      const hit = out.find((x) => x.imageUrl === m.imageUrl);
      if (hit) {
        if (!hit.title && title) hit.title = title;
        if (!hit.sectionKey && m.sectionKey) hit.sectionKey = m.sectionKey;
        if (!hit.insertMode && m.insertMode) hit.insertMode = m.insertMode;
        if (
          (!hit.plotHref || !hrefHasChartAssetId(hit.plotHref))
          && plotHref
        ) {
          hit.plotHref = plotHref;
        }
        if (!hit.replaceImageUrl) hit.replaceImageUrl = m.replaceImageUrl ?? m.imageUrl;
        if (!hit.figureSpecEnc && replay.figureSpecEnc) {
          hit.figureSpecEnc = replay.figureSpecEnc;
        }
        if (!hit.chartAssetId && replay.chartAssetId) {
          hit.chartAssetId = replay.chartAssetId;
        }
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
      ...replay,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 合并项目图表库（补全会话未带 section / 精修深链的项） */
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
      const hit = merged.find((x) => x.imageUrl === c.imageUrl);
      if (hit) {
        if (!hit.sectionKey && c.sectionKey) hit.sectionKey = c.sectionKey;
        if (!hit.title && c.caption) hit.title = c.caption;
        if (!hit.figureSpecEnc && c.figureSpecEnc) hit.figureSpecEnc = c.figureSpecEnc;
        if (!hit.chartAssetId && c.id) hit.chartAssetId = c.id;
        // 资产深链优先于易截断的 figureSpec URL
        if (assetHref && c.figureSpecEnc) {
          hit.plotHref = assetHref;
        } else if (!hit.plotHref && assetHref) {
          hit.plotHref = assetHref;
        }
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
      figureSpecEnc: c.figureSpecEnc,
      chartAssetId: c.id,
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

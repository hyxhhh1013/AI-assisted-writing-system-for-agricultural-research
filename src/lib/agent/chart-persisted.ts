/** 从 Agent generate_chart observation 解析「已登记图表」 */

export interface AgentChartPersistedInfo {
  tool: string;
  imageUrl: string;
  caption?: string;
  sectionKey?: string;
  chartAssetId?: string;
}

function extractOneChart(tool: string, data: Record<string, unknown>): AgentChartPersistedInfo | null {
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
  if (!imageUrl) return null;

  const persisted = data.persisted;
  let sectionKey: string | undefined;
  let chartAssetId: string | undefined;
  let caption: string | undefined;

  if (persisted && typeof persisted === "object") {
    const p = persisted as Record<string, unknown>;
    if (typeof p.sectionKey === "string" && p.sectionKey.trim()) {
      sectionKey = p.sectionKey.trim();
    }
    if (typeof p.id === "string") chartAssetId = p.id;
    if (typeof p.caption === "string") caption = p.caption;
  }

  if (typeof data.insertedSection === "string" && data.insertedSection.trim()) {
    sectionKey = data.insertedSection.trim();
  }

  return {
    tool,
    imageUrl,
    caption,
    sectionKey,
    chartAssetId,
  };
}

export function extractChartPersisted(
  tool: string,
  result: { success?: boolean; data?: unknown } | undefined,
): AgentChartPersistedInfo | null {
  if (tool !== "generate_chart" && tool !== "draft_mechanism_figure") return null;
  if (!result?.success || result.data == null || typeof result.data !== "object") {
    return null;
  }

  const data = result.data as Record<string, unknown>;

  // 批量：取第一张成功图（UI 预览）
  if (Array.isArray(data.charts) && data.charts.length > 0) {
    const first = data.charts.find(
      (c): c is Record<string, unknown> =>
        typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).imageUrl === "string",
    );
    if (first) return extractOneChart(tool, first);
  }

  return extractOneChart(tool, data);
}

import fs from "node:fs";
import path from "node:path";
import type { ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts } from "@/contracts/figure";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

/** 生成图存放目录（与 chart-runner / mechanism-runner 一致） */
const CHARTS_DIR = path.join(process.cwd(), "data", "charts");

/** 视觉描述缓存上限（进程内，防内存膨胀） */
const VISION_CACHE_MAX = 32;
/** 视觉描述缓存：key = 文件路径 + mtime + size（图重新生成时自动失效） */
const visionCache = new Map<string, { text: string; source: string }>();

function fileCacheKey(filePath: string): string {
  try {
    const st = fs.statSync(filePath);
    return `${filePath}:${st.mtimeMs}:${st.size}`;
  } catch {
    return ""; // stat 失败 → 不缓存
  }
}

/**
 * 计算并缓存一张图的视觉描述：命中缓存直接返回；未命中则调 describeImage（GLM-4V）并写缓存。
 * 缓存 key 含 mtime + size，图重新生成（新文件）时自动失效。
 * describeImage 失败（非 ready）时抛错，由调用方转为可读错误。
 */
export async function getOrComputeVisionDescription(
  filePath: string,
): Promise<{ text: string; source: string }> {
  const cacheKey = fileCacheKey(filePath);
  const hit = cacheKey ? visionCache.get(cacheKey) : undefined;
  if (hit) return hit;

  const description = await describeImage(filePath);
  if (description.status !== "ready" || !description.text) {
    throw new Error(`视觉模型未能理解该图：${description.error ?? "未知原因"}`);
  }
  const result = { text: description.text, source: description.source };
  if (cacheKey) {
    if (visionCache.size >= VISION_CACHE_MAX) {
      const firstKey = visionCache.keys().next().value;
      if (firstKey) visionCache.delete(firstKey);
    }
    visionCache.set(cacheKey, result);
  }
  return result;
}

/** 仅供测试：清空视觉描述缓存 */
export function clearVisionCacheForTest(): void {
  visionCache.clear();
}

/** 生成图文件名白名单：UUID + 允许的扩展名（对齐 project-charts.ts 的 SAFE 模式） */
const SAFE_CHART_FILENAME_RE = /^[0-9a-f-]{8,}\.(png|svg|pdf)$/i;

function imageUrlToFilePath(imageUrl: string): string | null {
  // /api/charts/<uuid>.png → data/charts/<uuid>.png
  const m = /^\/api\/charts\/([^/?#]+)$/.exec(imageUrl.trim());
  if (!m) return null;
  const filename = m[1];
  // 拒绝 ..\、..、空文件名等路径穿越：文件名必须是 UUID 形态 + 允许的扩展名
  if (!SAFE_CHART_FILENAME_RE.test(filename)) return null;
  const filePath = path.resolve(CHARTS_DIR, filename);
  const base = path.resolve(CHARTS_DIR) + path.sep;
  if (!filePath.startsWith(base)) return null; // 双保险：必须落在 CHARTS_DIR 内
  return filePath;
}

/**
 * 回看项目里已生成的图表/机理图：用视觉模型理解画面内容，
 * 供 agent 生成后自查与迭代优化（生成 → 回看 → 修正）。
 */
export const readFigureTool: ToolDefinition = {
  name: "read_figure",
  description:
    "回看项目里已生成的图表/配图/机理图（用视觉模型理解画面内容与可读文字），用于生成后自查质量与迭代优化。"
    + "用 sectionKey 定位章节，再用 index 或 figureId 选图（默认该章节最新一张）。",
  parameters: {
    type: "object",
    properties: {
      sectionKey: {
        type: "string",
        description: "图所在章节 key（如 results、discussion、literature_body）",
      },
      figureId: {
        type: "string",
        description: "可选：图表类型 id（bar/line/xrd/mechanism 等），与 sectionKey 联用过滤",
      },
      index: {
        type: "number",
        description: "可选：该章节第几张图（0 起），默认最新一张",
      },
    },
    required: ["sectionKey"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const sectionKey = String(params.sectionKey ?? "").trim();
    if (!sectionKey) return { success: false, error: "read_figure 需要 sectionKey" };
    if (!ctx.projectId) return { success: false, error: "read_figure 需要绑定 projectId" };

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: { charts: true },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }
    // Project.charts 为 JSON 字符串；顺带兼容直接返回数组的场景
    const chartsRaw = project.charts;
    const charts = Array.isArray(chartsRaw)
      ? (chartsRaw as ProjectChartAsset[])
      : parseProjectCharts(chartsRaw);

    let list = charts.filter((c) => c.sectionKey === sectionKey);
    if (list.length === 0) {
      return { success: false, error: `章节 ${sectionKey} 还没有已生成的图；先用 generate_chart / draft_mechanism_figure 生成` };
    }
    const figureIdRaw = String(params.figureId ?? "").trim();
    if (figureIdRaw) {
      const filtered = list.filter((c) => c.figureId === figureIdRaw);
      if (filtered.length === 0) {
        return {
          success: false,
          error: `章节 ${sectionKey} 没有 figureId=${figureIdRaw} 的图；可选：${list.map((c) => c.figureId).join(", ")}`,
        };
      }
      list = filtered;
    }
    const rawIndex = Number(params.index);
    const idx = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.min(Math.floor(rawIndex), list.length - 1) : list.length - 1;
    const asset = list[idx];
    if (!asset) return { success: false, error: `章节 ${sectionKey} 没有可读的图` };

    const filePath = imageUrlToFilePath(asset.imageUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        success: false,
        error: `图文件不存在（${asset.imageUrl}）。若刚生成，稍后重试；或检查 data/charts 目录`,
      };
    }
    // 视觉描述带进程内缓存（mtime+size 失效）；describeImage 内含 8MB 大小守卫 + mimeOf + try/catch
    let vision: { text: string; source: string };
    try {
      vision = await getOrComputeVisionDescription(filePath);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    return {
      success: true,
      summary: `已回看 ${sectionKey} 的图（${asset.figureId ?? "?"}）：${asset.caption ?? ""}`,
      data: {
        description: vision.text,
        caption: asset.caption ?? "",
        figureId: asset.figureId ?? "",
        sectionKey,
        index: idx,
        imageUrl: asset.imageUrl,
      },
    };
  },
};

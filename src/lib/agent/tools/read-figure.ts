import fs from "node:fs";
import path from "node:path";
import type { ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts } from "@/contracts/figure";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import { isSchematicFigureId } from "@/lib/agent/figure-loop";
import { FIGURE_QA_PROMPT, parseFigureQaVerdict } from "@/lib/agent/figure-qa";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";
import { getChartsDir } from "@/lib/charts-dir";

/** 视觉描述缓存上限（进程内，防内存膨胀） */
const VISION_CACHE_MAX = 32;
/** 视觉描述缓存：key = 文件路径 + mtime + size + mode（图重新生成时自动失效） */
const visionCache = new Map<string, { text: string; source: string }>();

function fileCacheKey(filePath: string, mode: string): string {
  try {
    const st = fs.statSync(filePath);
    return `${filePath}:${st.mtimeMs}:${st.size}:${mode}`;
  } catch {
    return ""; // stat 失败 → 不缓存
  }
}

/**
 * 计算并缓存一张图的视觉描述：命中缓存直接返回；未命中则调 describeImage 并写缓存。
 * 缓存 key 含 mtime + size + mode，图重新生成（新文件）时自动失效。
 * describeImage 失败（非 ready）时抛错，由调用方转为可读错误。
 */
export async function getOrComputeVisionDescription(
  filePath: string,
  mode: "describe" | "qa" = "describe",
): Promise<{ text: string; source: string }> {
  const cacheKey = fileCacheKey(filePath, mode);
  const hit = cacheKey ? visionCache.get(cacheKey) : undefined;
  if (hit) return hit;

  const description =
    mode === "qa"
      ? await describeImage(filePath, { prompt: FIGURE_QA_PROMPT })
      : await describeImage(filePath);
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
  const chartsDir = getChartsDir();
  const filePath = path.resolve(chartsDir, filename);
  const base = path.resolve(chartsDir) + path.sep;
  if (!filePath.startsWith(base)) return null; // 双保险：必须落在 CHARTS_DIR 内
  return filePath;
}

function loadCharts(chartsRaw: unknown): ProjectChartAsset[] {
  if (Array.isArray(chartsRaw)) return chartsRaw as ProjectChartAsset[];
  if (typeof chartsRaw === "string" || chartsRaw == null) {
    return parseProjectCharts(chartsRaw);
  }
  return [];
}

/**
 * 回看项目里已生成的图表/机理图：用视觉模型理解画面内容，
 * 供 agent 生成后自查与迭代优化（生成 → 回看 → 修正）。
 */
export const readFigureTool: ToolDefinition = {
  name: "read_figure",
  description:
    "回看已生成的配图。"
    + "mode=qa 仅用于机理图/流程图/分子式（draft_mechanism_figure）；数据图请看 generate_chart 的 qaReport，不要对柱状/折线/热力跑识图 QA。"
    + "describe 可理解任意已生成图。也可按 sectionKey（+ index/figureId）定位。",
  parameters: {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        description: "优先：/api/charts/<uuid>.png（生成工具返回的 imageUrl）",
      },
      sectionKey: {
        type: "string",
        description: "图所在章节 key（如 results）；与 imageUrl 二选一（都无则取项目最新一张）",
      },
      figureId: {
        type: "string",
        description: "可选：图表类型 id（bar/line/xrd/mechanism_panel/flow 等）",
      },
      index: {
        type: "number",
        description: "可选：筛选列表中的第几张（0 起），默认最新一张",
      },
      mode: {
        type: "string",
        enum: ["describe", "qa"],
        description: "describe=画面理解（默认）；qa=机理图/配图质检（生成后自检用）",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) return { success: false, error: "read_figure 需要绑定 projectId" };

    const modeRaw = String(params.mode ?? "describe").toLowerCase();
    const mode: "describe" | "qa" = modeRaw === "qa" ? "qa" : "describe";
    const imageUrlDirect = String(params.imageUrl ?? "").trim();

    let asset: ProjectChartAsset | null = null;
    let filePath: string | null = null;
    let imageUrl = imageUrlDirect;

    if (imageUrlDirect) {
      filePath = imageUrlToFilePath(imageUrlDirect);
      if (!filePath) {
        return { success: false, error: `无法解析 imageUrl：${imageUrlDirect}` };
      }
    } else {
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: { charts: true },
      });
      if (!project) {
        return { success: false, error: "项目不存在或无权访问" };
      }
      let list = loadCharts(project.charts);
      const sectionKey = String(params.sectionKey ?? "").trim();
      if (sectionKey) {
        list = list.filter((c) => c.sectionKey === sectionKey);
        if (list.length === 0) {
          return {
            success: false,
            error: `章节 ${sectionKey} 还没有已生成的图；先用 generate_chart / draft_mechanism_figure 生成，或直接传 imageUrl`,
          };
        }
      } else if (list.length === 0) {
        return {
          success: false,
          error: "项目还没有已生成的图；先 generate_chart / draft_mechanism_figure，或传 imageUrl",
        };
      }

      const figureIdRaw = String(params.figureId ?? "").trim();
      if (figureIdRaw) {
        const filtered = list.filter((c) => c.figureId === figureIdRaw);
        if (filtered.length === 0) {
          return {
            success: false,
            error: `没有 figureId=${figureIdRaw} 的图；可选：${[...new Set(list.map((c) => c.figureId).filter(Boolean))].join(", ")}`,
          };
        }
        list = filtered;
      }

      const rawIndex = Number(params.index);
      const idx =
        Number.isFinite(rawIndex) && rawIndex >= 0
          ? Math.min(Math.floor(rawIndex), list.length - 1)
          : list.length - 1;
      asset = list[idx] ?? null;
      if (!asset) return { success: false, error: "没有可读的图" };
      imageUrl = asset.imageUrl;
      filePath = imageUrlToFilePath(asset.imageUrl);
      if (!filePath) {
        return { success: false, error: `无法解析图路径（${asset.imageUrl}）` };
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return {
        success: false,
        error: `图文件不存在（${imageUrl}）。若刚生成，稍后重试；或检查 data/charts 目录`,
      };
    }

    let figureId = String(params.figureId ?? asset?.figureId ?? "").trim();
    if (mode === "qa" && !figureId && ctx.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: { charts: true },
      });
      if (project) {
        const hit = loadCharts(project.charts).find((c) => c.imageUrl === imageUrl);
        if (hit?.figureId) {
          figureId = hit.figureId;
          asset = hit;
        }
      }
    }

    if (mode === "qa" && !isSchematicFigureId(figureId)) {
      return {
        success: true,
        summary: `已跳过识图 QA（数据图${figureId ? ` ${figureId}` : ""}）。请看 generate_chart.qaReport。`,
        data: {
          description:
            "数据图不走机理图识图质检。单位/重叠/刊规见 generate_chart 返回的 qaReport。",
          mode,
          skippedVision: true,
          needsRegen: false,
          needsPolish: false,
          qaVerdict: "pass",
          caption: asset?.caption ?? "",
          figureId,
          sectionKey: asset?.sectionKey ?? "",
          imageUrl,
        },
      };
    }

    let vision: { text: string; source: string };
    try {
      vision = await getOrComputeVisionDescription(filePath, mode);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    const qa =
      mode === "qa" ? parseFigureQaVerdict(vision.text) : null;

    const qaLabel =
      qa?.verdict === "regen"
        ? "需重生成"
        : qa?.verdict === "polish"
          ? "可接受·建议精修"
          : qa?.verdict === "pass"
            ? "可接受"
            : undefined;

    return {
      success: true,
      summary: asset
        ? `已回看${mode === "qa" ? "并质检" : ""} ${asset.sectionKey ?? "项目"} 的图（${asset.figureId ?? "?"}）：${asset.caption ?? ""}${qaLabel ? ` · ${qaLabel}` : ""}`
        : `已回看${mode === "qa" ? "并质检" : ""} ${imageUrl}${qaLabel ? ` · ${qaLabel}` : ""}`,
      data: {
        description: vision.text,
        mode,
        needsRegen: qa?.needsRegen || undefined,
        needsPolish: qa?.needsPolish || undefined,
        qaVerdict: qa?.verdict,
        caption: asset?.caption ?? "",
        figureId: asset?.figureId ?? "",
        sectionKey: asset?.sectionKey ?? "",
        imageUrl,
      },
    };
  },
};

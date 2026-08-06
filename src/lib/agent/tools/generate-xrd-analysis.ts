import { buildPlotInsertReplay } from "@/contracts/figure";
import { persistAgentChart } from "@/lib/agent/chart-persist";
import { appendAgentSectionMarkdown } from "@/lib/agent/project-persist";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { runScherrerGeneration } from "@/lib/xrd-scherrer-runner";
import { matchXrdPhases } from "@/lib/xrd-phase-match";
import {
  buildPhaseMatchTableHtml,
  buildScherrerResultTableHtml,
  buildXrdPeakTableHtml,
} from "@/lib/xrd-workflow-utils";
import { xrdScherrerSchema } from "@/lib/validations";
import type { PeakInfo } from "@/services/xrd";

type XrdAnalysisAction = "scherrer" | "peak_table" | "phase_search" | "workflow_link";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePeaksJson(raw: string): PeakInfo[] | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "peaksJson 必须是 JSON 数组字符串" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "peaksJson 必须是非空数组" };
  }
  const peaks: PeakInfo[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!isRecord(item)) {
      return { error: `peaksJson[${i}] 必须是对象` };
    }
    const two_theta = Number(item.two_theta);
    if (!Number.isFinite(two_theta)) {
      return { error: `peaksJson[${i}].two_theta 无效` };
    }
    const intensity =
      item.intensity != null && Number.isFinite(Number(item.intensity))
        ? Number(item.intensity)
        : 0;
    const relative_intensity =
      item.relative_intensity != null && Number.isFinite(Number(item.relative_intensity))
        ? Number(item.relative_intensity)
        : 100;
    const fwhm =
      item.fwhm != null && Number.isFinite(Number(item.fwhm)) && Number(item.fwhm) > 0
        ? Number(item.fwhm)
        : undefined;
    peaks.push({ two_theta, intensity, relative_intensity, fwhm });
  }
  return peaks;
}

function peaksToScherrerInput(peaks: PeakInfo[]): { two_theta: number; fwhm: number; label?: string }[] {
  return peaks.map((p, i) => {
    const fwhm = p.fwhm != null && p.fwhm > 0 ? p.fwhm : 0.25;
    return {
      two_theta: p.two_theta,
      fwhm,
      label: `Peak${i + 1}`,
    };
  });
}

function buildWorkflowHref(projectId?: string): string {
  const base = projectId
    ? `/plot?id=${encodeURIComponent(projectId)}&category=xrd&figure=xrd_workflow`
    : "/plot?category=xrd&figure=xrd_workflow";
  return base;
}

export const generateXrdAnalysisTool: ToolDefinition = {
  name: "generate_xrd_analysis",
  description:
    "XRD 分析写回：action=scherrer 用 peaksJson 算 Scherrer 并出图；action=phase_search 内置相库匹配；action=peak_table 插入峰表；action=workflow_link 返回工作流深链。传 sectionKey 可插入章节。不要编造峰位",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["scherrer", "peak_table", "phase_search", "workflow_link"],
        description: "scherrer=晶粒尺寸；phase_search=相检索；peak_table=峰表；workflow_link=工作流向导",
      },
      peaksJson: {
        type: "string",
        description:
          "峰列表 JSON 数组，例：[{\"two_theta\":28.4,\"fwhm\":0.25,\"label\":\"(111)\"}]",
      },
      title: { type: "string", description: "图/表标题" },
      caption: { type: "string", description: "图注（Scherrer 出图时使用，默认同 title）" },
      wavelength: { type: "number", description: "X 射线波长 Å，默认 1.5406" },
      shape_factor: { type: "number", description: "Scherrer 形状因子 K，默认 0.9" },
      sectionKey: {
        type: "string",
        description: "可选：论文章节 key（如 results），插入图片或 HTML 表",
      },
      insertTable: {
        type: "string",
        description: "Scherrer 时是否在章节追加结果表 HTML（默认 true）",
      },
      persistToProject: {
        type: "string",
        description: "Scherrer 时是否写入 Project.charts（默认 true）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    const action = (String(params.action ?? "scherrer").trim() ||
      "scherrer") as XrdAnalysisAction;
    if (action !== "scherrer" && action !== "peak_table" && action !== "phase_search" && action !== "workflow_link") {
      return { success: false, error: `无效 action: ${action}` };
    }

    if (action === "workflow_link") {
      const href = buildWorkflowHref(ctx.projectId);
      return {
        success: true,
        data: { action, href },
        summary: `XRD 工作流入口：${href}（导入 → 叠加 → 峰拟合 → Scherrer）`,
      };
    }

    if (!ctx.projectId) {
      return { success: false, error: "generate_xrd_analysis 需要关联 projectId" };
    }

    const peaksRaw = String(params.peaksJson ?? "").trim();
    if (!peaksRaw) {
      return {
        success: false,
        error: "缺少 peaksJson：请提供实测或用户确认的峰位与 FWHM，不要编造",
      };
    }

    const parsedPeaks = parsePeaksJson(peaksRaw);
    if ("error" in parsedPeaks) {
      return { success: false, error: parsedPeaks.error };
    }

    const title = String(params.title ?? "").trim() || "XRD 分析";
    const sectionKeyRaw = params.sectionKey ? String(params.sectionKey).trim() : "";
    const sectionKey =
      sectionKeyRaw && isAgentWritingSectionKey(sectionKeyRaw)
        ? sectionKeyRaw
        : sectionKeyRaw
          ? null
          : undefined;
    if (sectionKeyRaw && sectionKey === null) {
      return {
        success: false,
        error: `无效 sectionKey: ${sectionKeyRaw}。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      };
    }

    if (action === "peak_table") {
      const html = buildXrdPeakTableHtml(title, parsedPeaks);
      let insertedSection: string | undefined;
      if (sectionKey) {
        await appendAgentSectionMarkdown(ctx.userId, ctx.projectId, sectionKey, `\n\n${html}\n\n`);
        insertedSection = sectionKey;
      }
      const bits = [`已生成峰表「${title}」`];
      if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);
      return {
        success: true,
        data: { action, peakCount: parsedPeaks.length, insertedSection },
        summary: bits.join("；"),
      };
    }

    if (action === "phase_search") {
      const matches = matchXrdPhases(
        parsedPeaks.map((p) => ({
          two_theta: p.two_theta,
          intensity: p.intensity,
          relative_intensity: p.relative_intensity,
        })),
        { top_k: 5 },
      );
      let insertedSection: string | undefined;
      if (sectionKey && matches.length > 0) {
        const html = buildPhaseMatchTableHtml(title, matches);
        await appendAgentSectionMarkdown(ctx.userId, ctx.projectId, sectionKey, `\n\n${html}\n\n`);
        insertedSection = sectionKey;
      }
      const top = matches[0];
      const bits = [
        matches.length > 0
          ? `相检索 Top1：${top.name} (${top.formula}) ${(top.score * 100).toFixed(0)}%`
          : "未匹配到参考相",
      ];
      if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);
      return {
        success: true,
        data: {
          action,
          matchCount: matches.length,
          topMatch: top ?? null,
          matches,
          insertedSection,
        },
        summary: bits.join("；"),
      };
    }

    const scherrerPeaks = peaksToScherrerInput(parsedPeaks);
    const scherrerBody = {
      peaks: scherrerPeaks,
      wavelength: params.wavelength != null ? Number(params.wavelength) : undefined,
      shape_factor: params.shape_factor != null ? Number(params.shape_factor) : undefined,
      title,
    };
    const validated = xrdScherrerSchema.safeParse(scherrerBody);
    if (!validated.success) {
      return {
        success: false,
        error: `Scherrer 参数无效: ${validated.error.issues.map((i) => i.message).join("; ")}`,
      };
    }

    const caption = String(params.caption ?? "").trim() || title;
    const persistToProject = parsePersistToProject(params.persistToProject);
    const insertTable = params.insertTable !== "false" && params.insertTable !== "0";

    try {
      const generated = await runScherrerGeneration(validated.data);
      const replay = buildPlotInsertReplay("xrd_scherrer", caption, validated.data);

      let persisted = null;
      let insertedSection: string | undefined;

      if (persistToProject) {
        persisted = await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: "xrd_scherrer",
          caption,
          imageUrl: generated.imageUrl,
          sectionKey: sectionKey ?? undefined,
          figureSpecEnc: replay.figureSpecEnc,
        });
      }

      if (sectionKey) {
        let md = `\n\n![${caption}](${generated.imageUrl})\n\n`;
        if (insertTable && generated.data?.peaks?.length) {
          const meanNm = generated.data.mean_size_nm ?? 0;
          md += `${buildScherrerResultTableHtml(caption, generated.data.peaks, meanNm)}\n\n`;
        }
        await appendAgentSectionMarkdown(ctx.userId, ctx.projectId, sectionKey, md);
        insertedSection = sectionKey;
      }

      const meanNm = generated.data?.mean_size_nm;
      const bits = [`Scherrer「${title}」`];
      if (meanNm != null && Number.isFinite(meanNm)) {
        bits.push(`平均晶粒尺寸约 ${meanNm.toFixed(1)} nm`);
      }
      if (persisted) bits.push("已登记到项目图表库");
      if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);

      return {
        success: true,
        data: {
          action,
          imageUrl: generated.imageUrl,
          meanSizeNm: meanNm,
          peakCount: generated.data?.n_peaks ?? scherrerPeaks.length,
          persisted,
          insertedSection,
          hasReplay: Boolean(replay.figureSpecEnc),
          workflowHref: buildWorkflowHref(ctx.projectId),
        },
        summary: bits.join("；"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

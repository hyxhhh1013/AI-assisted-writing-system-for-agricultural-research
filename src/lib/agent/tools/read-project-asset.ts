import { parsePaperPassport } from "@/contracts/paper-passport";
import { readArgumentBlueprint } from "@/lib/project-argument-blueprint-db";
import { readWritingBlueprint } from "@/lib/project-writing-blueprint-db";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

const ASSETS = [
  "outline",
  "writing_blueprint",
  "argument_blueprint",
  "passport",
  "analysis_notes",
  "abstract",
] as const;

type AssetKind = (typeof ASSETS)[number];

const MAX_CHARS = 10_000;
const DEFAULT_CHARS = 5000;

function windowText(
  text: string,
  maxChars: number,
  part: "head" | "tail",
  offset?: number,
): {
  body: string;
  totalLen: number;
  start: number;
  end: number;
  truncated: boolean;
  hint?: string;
} {
  const totalLen = text.length;
  const limit = Math.min(Math.max(maxChars, 200), MAX_CHARS);
  if (totalLen === 0) {
    return { body: "（空）", totalLen: 0, start: 0, end: 0, truncated: false };
  }
  let start = 0;
  if (offset != null && Number.isFinite(offset) && offset >= 0) {
    start = Math.min(Math.floor(offset), Math.max(totalLen - 1, 0));
  } else if (part === "tail") {
    start = Math.max(totalLen - limit, 0);
  }
  const end = Math.min(start + limit, totalLen);
  const slice = text.slice(start, end);
  const hasMoreBefore = start > 0;
  const hasMoreAfter = end < totalLen;
  const hints: string[] = [];
  if (hasMoreAfter) hints.push(`offset=${end}`);
  if (hasMoreBefore && part !== "tail") hints.push(`part=tail 看结尾`);
  return {
    body:
      (hasMoreBefore ? "…[前文省略]\n" : "")
      + slice
      + (hasMoreAfter ? "\n…[后文省略]" : ""),
    totalLen,
    start,
    end,
    truncated: hasMoreBefore || hasMoreAfter,
    hint: hints.join("；") || undefined,
  };
}

/**
 * 读取大纲/蓝图/护照/分析笔记等「非章节」项目资产（对齐 academic-paper 各阶段材料）。
 */
export const readProjectAssetTool: ToolDefinition = {
  name: "read_project_asset",
  description:
    "读取项目级资产：outline（大纲）、writing_blueprint（写作蓝图）、argument_blueprint（论证蓝图）、passport（阶段护照/配置）、analysis_notes（分析笔记）、abstract（摘要）。改结构/论证/配置前应先读",
  parameters: {
    type: "object",
    properties: {
      asset: {
        type: "string",
        description: "资产种类",
        enum: [...ASSETS],
      },
      maxChars: {
        type: "number",
        description: `窗口字符上限，默认 ${DEFAULT_CHARS}，上限 ${MAX_CHARS}`,
      },
      offset: {
        type: "number",
        description: "字符偏移（优先于 part）",
      },
      part: {
        type: "string",
        description: "head 或 tail",
        enum: ["head", "tail"],
      },
    },
    required: ["asset"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "read_project_asset 需要绑定 projectId" };
    }
    const asset = String(params.asset ?? "").trim() as AssetKind;
    if (!ASSETS.includes(asset)) {
      return { success: false, error: `无效 asset: ${asset}` };
    }

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: {
        outline: true,
        abstract: true,
        paperPassport: true,
        analysisResults: { select: { id: true, content: true }, take: 20 },
      },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    let raw = "";
    let meta: Record<string, unknown> = { asset };

    if (asset === "outline") {
      raw = project.outline ?? "";
    } else if (asset === "abstract") {
      raw = project.abstract ?? "";
    } else if (asset === "writing_blueprint") {
      raw = (await readWritingBlueprint(ctx.projectId)) ?? "";
    } else if (asset === "argument_blueprint") {
      raw = (await readArgumentBlueprint(ctx.projectId)) ?? "";
    } else if (asset === "passport") {
      const passport = parsePaperPassport(project.paperPassport);
      raw = passport ? JSON.stringify(passport, null, 2) : "";
      meta = {
        ...meta,
        currentPhase: passport?.currentPhase ?? null,
        hasConfig: Boolean(passport?.config),
      };
    } else if (asset === "analysis_notes") {
      const notes = project.analysisResults
        .map((r, i) => `### 笔记 ${i + 1} (${r.id})\n${r.content}`)
        .join("\n\n");
      raw = notes;
      meta = { ...meta, noteCount: project.analysisResults.length };
    }

    const maxChars = Number(params.maxChars) || DEFAULT_CHARS;
    const part = String(params.part ?? "head") === "tail" ? "tail" : "head";
    const offsetRaw = Number(params.offset);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : undefined;
    const win = windowText(raw, maxChars, part, offset);

    if (!raw.trim()) {
      return {
        success: true,
        data: { ...meta, empty: true, content: "（该资产尚无内容）" },
        summary: `${asset} 为空`,
      };
    }

    return {
      success: true,
      data: {
        ...meta,
        empty: false,
        totalLen: win.totalLen,
        offset: win.start,
        returnedLen: win.end - win.start,
        truncated: win.truncated,
        hint: win.hint,
        content: win.body,
      },
      summary: win.truncated
        ? `已读 ${asset}（${win.start}-${win.end}/${win.totalLen}${win.hint ? `；${win.hint}` : ""}）`
        : `已读 ${asset}（完整，${win.totalLen} 字符）`,
    };
  },
};

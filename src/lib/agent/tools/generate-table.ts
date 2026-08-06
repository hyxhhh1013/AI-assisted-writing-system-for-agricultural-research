import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { appendAgentSectionMarkdown } from "@/lib/agent/project-persist";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

export interface TableGenerationResult {
  latex: string;
  html: string;
  statsText: string;
  letters: Record<string, string>;
}

/** 服务端生成三线表（make_table.py）：返回 LaTeX / HTML / 统计文字 */
export async function runTableGeneration(
  config: Record<string, unknown>,
): Promise<TableGenerationResult> {
  const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });
  const configPath = path.join(tmpDir, "table_config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  const scriptPath = path.join(SCRIPTS_DIR, "make_table.py");
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        PYTHON_CMD,
        [scriptPath, "--config", configPath, "--output", tmpDir],
        {
          shell: false,
          env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
        },
      );
      let stderr = "";
      proc.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr || `Python 退出码 ${code}`));
        else resolve();
      });
      proc.on("error", (err) => {
        reject(new Error(formatPythonSpawnError(getErrorMessage(err))));
      });
    });
    const resultPath = path.join(tmpDir, "result.json");
    const resultJson = JSON.parse(fs.readFileSync(resultPath, "utf-8")) as {
      status: string;
      message?: string;
      latex?: string;
      html?: string;
      stats_text?: string;
      letters?: Record<string, string>;
    };
    if (resultJson.status !== "ok") {
      throw new Error(resultJson.message || "三线表生成失败");
    }
    return {
      latex: resultJson.latex ?? "",
      html: resultJson.html ?? "",
      statsText: resultJson.stats_text ?? "",
      letters: resultJson.letters ?? {},
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** 三线表：生成 GB/T 7714 表格（LaTeX/HTML）+ 统计文字；传 sectionKey 插入 HTML 表格 */
export const generateTableTool: ToolDefinition = {
  name: "generate_table",
  description:
    "生成 GB/T 7714 三线表 + 统计文字。groups 传每组 {label, n, mean, sd}；"
    + "可传 anova {F,df1,df2,p} 与 posthoc [{pair:[A,B],p}] 生成方差分析与差异字母。"
    + "传 sectionKey 会把 HTML 表格插入章节正文（可在预览中渲染）。",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "表标题，如「表1 不同处理对产量的影响」" },
      columnHeader: { type: "string", description: "指标列名，如「产量 (kg/ha)」" },
      groups: {
        type: "array",
        items: { type: "object" },
        description: "分组数据：[{label, n, mean, sd}]",
      },
      anova: {
        type: "object",
        description: "单因素方差分析：{F, df1, df2, p}",
      },
      posthoc: {
        type: "array",
        description: "事后检验差异：[{pair: [组A, 组B], p}]",
      },
      alpha: { type: "number", description: "显著性水平（默认 0.05）" },
      note: { type: "string", description: "表注（默认标准句式）" },
      sectionKey: {
        type: "string",
        description: `可选：论文章节 key，提供则插入 HTML 表格到该章节。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      },
    },
    required: ["title", "groups"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_table 需要关联 projectId" };
    }

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

    const groups = Array.isArray(params.groups) ? params.groups : [];
    if (groups.length === 0) {
      return { success: false, error: "groups 至少需要一组数据" };
    }

    const config: Record<string, unknown> = {
      title: String(params.title ?? "").trim() || "表 数据汇总",
      column_header: String(params.columnHeader ?? "").trim() || "指标",
      groups,
    };
    if (params.anova && typeof params.anova === "object") config.anova = params.anova;
    if (Array.isArray(params.posthoc)) config.posthoc = params.posthoc;
    if (params.alpha != null) config.alpha = Number(params.alpha);
    if (params.note) config.note = String(params.note);

    try {
      const result = await runTableGeneration(config);

      let insertedSection: string | undefined;
      if (sectionKey && result.html) {
        await appendAgentSectionMarkdown(
          ctx.userId,
          ctx.projectId,
          sectionKey,
          `\n\n${result.html}\n\n`,
        );
        insertedSection = sectionKey;
      }

      return {
        success: true,
        data: { ...result, insertedSection },
        summary:
          `已生成三线表「${config.title}」`
          + (insertedSection ? `，表格已插入章节 ${insertedSection}` : "（未插入，可传 sectionKey）"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

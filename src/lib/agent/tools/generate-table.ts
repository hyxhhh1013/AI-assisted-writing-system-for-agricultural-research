import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { AGENT_WRITING_SECTIONS } from "@/lib/agent/writing-sections";
import {
  appendSectionAndVerify,
  formatInsertSummary,
  resolveInsertSectionKey,
} from "@/lib/agent/insert-section";
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

/** 蓝图对比表：只有文字行，不编造均值和显著性。 */
export function qualitativeTableMarkdown(
  title: string,
  rows: unknown,
): { title: string; markdown: string } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const matrix: string[][] = [];
  for (const row of rows) {
    if (Array.isArray(row)) {
      matrix.push(row.map((cell) => String(cell ?? "").trim()));
    }
  }
  if (matrix.length < 2) return null;
  const width = Math.max(...matrix.map((row) => row.length));
  const pad = (row: string[]) => {
    const cells = [...row];
    while (cells.length < width) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  const header = matrix[0] ?? [];
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = matrix.slice(1).map(pad).join("\n");
  return {
    title,
    markdown: `**${title}**\n\n${pad(header)}\n${sep}\n${body}`,
  };
}

/** 三线表：生成 GB/T 7714 表格（LaTeX/HTML）+ 统计文字；传 sectionKey 插入 HTML 表格。rows 为文字对比表，不走统计。 */
export const generateTableTool: ToolDefinition = {
  name: "generate_table",
  description:
    "生成表格并插入正文。有试验数据时用 groups（每组 {label, n, mean, sd}）生成三线表；"
    + "综述对比表用 rows（第一行是表头，后面是文字行），禁止编造均值。"
    + "可传 anova {F,df1,df2,p} 与 posthoc [{pair:[A,B],p}]。"
    + "默认插入正文：有 sectionKey 用该节，否则插入已有正文的结果/方法节（研究默认 results）。"
    + "生成后会回看正文是否含表题；未插入禁止当作已完成。",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "表标题，如「表1 不同处理对产量的影响」" },
      rows: {
        type: "array",
        items: { type: "array" },
        description: "文字对比表。第一行表头，其余每行是文字说明，不需要均值。",
      },
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
        description:
          `插入章节。省略则自动落入已写章节（优先 results/methods）。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      },
    },
    required: ["title"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_table 需要关联 projectId" };
    }

    const resolved = resolveInsertSectionKey(
      params.sectionKey,
      ctx.projectSnapshot,
    );
    if ("error" in resolved) {
      return { success: false, error: resolved.error };
    }
    const sectionKey = resolved.sectionKey;

    const qualitative = qualitativeTableMarkdown(
      String(params.title ?? "").trim() || "对比表",
      params.rows,
    );
    if (qualitative) {
      const landed = await appendSectionAndVerify({
        userId: ctx.userId,
        projectId: ctx.projectId,
        sectionKey,
        markdown: `\n\n${qualitative.markdown}\n\n`,
        needle: qualitative.title,
      });
      return {
        success: true,
        data: {
          title: qualitative.title,
          insertedSection: landed.insertedSection,
          verifiedInBody: landed.verifiedInBody,
          bodyExcerpt: landed.bodyExcerpt,
          inferredSection: resolved.inferred,
          qualitative: true,
        },
        summary:
          `已插入对比表「${qualitative.title}」。`
          + formatInsertSummary({
            inferred: resolved.inferred,
            insertedSection: landed.insertedSection,
            verifiedInBody: landed.verifiedInBody,
          }),
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
      const title = String(config.title);
      const chunk = `\n\n${result.html}\n\n`;
      const landed = await appendSectionAndVerify({
        userId: ctx.userId,
        projectId: ctx.projectId,
        sectionKey,
        markdown: chunk,
        needle: title,
      });

      return {
        success: true,
        data: {
          ...result,
          insertedSection: landed.insertedSection,
          verifiedInBody: landed.verifiedInBody,
          bodyExcerpt: landed.bodyExcerpt,
          inferredSection: resolved.inferred,
        },
        summary:
          `已生成三线表「${title}」。`
          + formatInsertSummary({
            inferred: resolved.inferred,
            insertedSection: landed.insertedSection,
            verifiedInBody: landed.verifiedInBody,
          }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

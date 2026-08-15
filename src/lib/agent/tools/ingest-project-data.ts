import { analyzeFile } from "@/services/data-analysis";
import { readAttachmentFile } from "@/lib/agent/attachments/storage";
import { persistIngestedAnalysis } from "@/lib/agent/ingest-project-data";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

const MAX_CSV_CHARS = 100_000;
const TABULAR_EXTS = new Set(["csv", "tsv", "xlsx", "xls"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isTabularName(name: string): boolean {
  return TABULAR_EXTS.has(extOf(name));
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

function analyzeInputFromBuffer(buf: Buffer, fileName: string): string | ArrayBuffer {
  const ext = extOf(fileName);
  if (ext === "xlsx" || ext === "xls") {
    return bufferToArrayBuffer(buf);
  }
  return buf.toString("utf8");
}

export const ingestProjectDataTool: ToolDefinition = {
  name: "ingest_project_data",
  description:
    "把表格入库为项目 dataSources + dataClaims（与数据面板同一份对象）。"
    + "传 attachmentId（本会话已上传的 csv/xlsx）或 csvData+fileName 粘贴。"
    + "空表不写库。入库后即可 list_plot_sources / generate_chart / write_section(results)。",
  parameters: {
    type: "object",
    properties: {
      attachmentId: {
        type: "string",
        description: "附件 id（list_attachments / 对话附件清单；也可用 fileId）",
      },
      fileId: {
        type: "string",
        description: "附件 id 别名（与 read_attachment 的 fileId 相同）",
      },
      csvData: {
        type: "string",
        description: "粘贴的 CSV/TSV 文本（与 attachmentId 二选一）",
      },
      fileName: {
        type: "string",
        description: "粘贴时的文件名，如 yield.csv（须带 csv/tsv/xlsx 扩展名）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "ingest_project_data 需要绑定 projectId" };
    }

    const attachmentId = String(params.attachmentId ?? params.fileId ?? "").trim();
    const csvData = typeof params.csvData === "string" ? params.csvData : "";
    const pastedName = String(params.fileName ?? "").trim();

    let fileName = "";
    let input: string | ArrayBuffer | null = null;

    if (attachmentId) {
      const row = await prisma.agentAttachment.findFirst({
        where: { id: attachmentId, userId: ctx.userId },
      });
      if (!row || row.userId !== ctx.userId) {
        return { success: false, error: "附件不存在或无权访问" };
      }
      const owned =
        (row.sessionId == null || row.sessionId === ctx.sessionId)
        || (row.pinned && ctx.projectId != null && row.projectId === ctx.projectId);
      if (!owned) {
        return { success: false, error: "该附件不属于当前会话/项目" };
      }
      fileName = row.originalName;
      if (!isTabularName(fileName)) {
        return {
          success: false,
          error: `「${fileName}」不是表格。请上传 CSV/Excel，或改用 csvData+fileName 粘贴。`,
        };
      }
      try {
        const buf = readAttachmentFile(ctx.userId, row.id);
        input = analyzeInputFromBuffer(buf, fileName);
      } catch {
        return { success: false, error: "附件文件缺失，请重新上传后再入库" };
      }
    } else if (csvData.trim() && pastedName) {
      if (!isTabularName(pastedName)) {
        return {
          success: false,
          error: "fileName 须为 csv/tsv/xlsx/xls，例如 yield.csv",
        };
      }
      if (csvData.length > MAX_CSV_CHARS) {
        return {
          success: false,
          error: `csvData 过长（>${MAX_CSV_CHARS} 字符），请改传附件`,
        };
      }
      fileName = pastedName;
      input = csvData;
    } else {
      return {
        success: false,
        error:
          "请提供 attachmentId（对话框已上传的 CSV/Excel），或同时提供 csvData 与 fileName。",
      };
    }

    const { analysis, claims } = await analyzeFile(input, fileName);
    if (analysis.rowCount <= 0) {
      return {
        success: false,
        error: `「${fileName}」没有有效数据行，未写入项目。请检查表头与至少一行数据。`,
      };
    }

    try {
      const persisted = await persistIngestedAnalysis({
        userId: ctx.userId,
        projectId: ctx.projectId,
        analysis,
        claims,
      });
      return {
        success: true,
        summary:
          `已入库 ${fileName}（${analysis.rowCount} 行，${claims.length} 条声明`
          + `${persisted.replaced ? "，覆盖同名源" : ""}）。`
          + "下一步：list_plot_sources 出图，或 write_section(results)。",
        data: {
          persisted: true,
          fileName,
          sourceId: persisted.sourceId,
          rowCount: analysis.rowCount,
          claimCount: claims.length,
          sourceCount: persisted.sources.length,
          replaced: persisted.replaced,
          dataFoundation: persisted.foundation,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "入库失败";
      return { success: false, error: message };
    }
  },
};

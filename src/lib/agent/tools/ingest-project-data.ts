import { commitConfirmedIngest } from "@/lib/agent/data-confirm";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const ingestProjectDataTool: ToolDefinition = {
  name: "ingest_project_data",
  description:
    "把用户确认过的读法入库，或把已做好的图登记进图表库。"
    + "表格不要套固定表头：先 read_attachment 看行号列号，再用 tablesJson 说明你怎么读。"
    + "调用后弹出确认卡，用户勾选之前不会写入。"
    + "传 attachmentId（本会话 csv/xlsx/dpt/xy/png/jpg/tiff）或 csvData+fileName。"
    + "已有图会先读出图上数值放到确认卡。用户勾选后，这些数写成 dataClaims，写作可以引用；没读出或没勾选的数字禁止写入正文。"
    + "用户改了某个数时，用 readingsJson 把改正后的点放进下一次确认，不要直接写进正文。"
    + "只有用户在对话里指定了章节时才传 sectionKey，把已有图插入该节。",
  parameters: {
    type: "object",
    properties: {
      attachmentId: {
        type: "string",
        description: "附件 id（表格或已有图；也可用 fileId）",
      },
      fileId: {
        type: "string",
        description: "附件 id 别名",
      },
      csvData: {
        type: "string",
        description: "粘贴的 CSV/TSV 文本（与 attachmentId 二选一）",
      },
      fileName: {
        type: "string",
        description: "粘贴时的文件名，如 yield.csv",
      },
      sectionKey: {
        type: "string",
        description: "仅当用户明确说把已有图插入哪一节时填写，如 results。表格不靠这个字段插图。",
      },
      tablesJson: {
        type: "string",
        description:
          "助手的读法，JSON 数组。每项含 label、note（这列数是什么意思）、sheet（工作表名）、headerRow（预览行号，从 1 起）、columns（列号数组，从 1 起）。没有表头时 headerless 为 true。例："
          + "[{\"label\":\"O1s\",\"note\":\"结合能对计数，不要当均值\",\"sheet\":\"O1s Scan\",\"headerRow\":16,\"columns\":[1,3]}]",
      },
      readingsJson: {
        type: "string",
        description: "用户在对话里改正后的读图数值 JSON：[{series,y,unit,x}]。有则确认卡用这份，不再重新读图。",
      },
    },
    required: [],
  },
  safety: "write",
  requiresConfirmation: true,
  async execute(params, ctx: AgentContext) {
    return commitConfirmedIngest(params, ctx);
  },
};

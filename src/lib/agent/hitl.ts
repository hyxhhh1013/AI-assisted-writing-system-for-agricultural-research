export const HITL_EYEBROW = "需要你拍板 · 已暂停";
export const HITL_EYEBROW_DANGER = "需要你拍板 · 破坏性操作";

export function confirmToolTitle(tool: string): string {
  if (tool === "import_reference") return "确认导入文献";
  if (tool === "ingest_project_data") return "确认实验数据";
  if (tool === "remove_figure") return "确认删除图表";
  if (tool === "remove_references") return "确认删除参考文献";
  return "需要你确认后再执行";
}

export function confirmToolDetail(tool: string, selectedCount?: number): string {
  if (tool === "import_reference") {
    return selectedCount != null
      ? `勾选要入库的文献。当前选中 ${selectedCount} 篇；不确认我不会写入参考文献。`
      : "过目后再决定导哪些。不确认我不会写入参考文献。";
  }
  if (tool === "ingest_project_data") {
    return selectedCount != null
      ? `勾选真正要入库的数据块和已有图。当前选中 ${selectedCount} 项。图上的数要对上再确认，确认后写作才能引用。`
      : "先核对每一块表和已有图。不确认我不会写入项目。";
  }
  if (tool === "remove_figure") {
    return "会从图表库删掉，并默认去掉正文里对应的图片。确认前可以先核对。";
  }
  if (tool === "remove_references") {
    return "删除后会重排后续编号。确认前请核对编号。";
  }
  return "这项操作会改项目内容。确认后我才执行，取消则跳过。";
}

export function isDestructiveConfirmTool(tool: string): boolean {
  return tool === "remove_figure" || tool === "remove_references";
}

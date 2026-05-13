import { useCallback } from "react";
import { toast } from "sonner";
import { mergeEditorIntoProject } from "@/lib/export-content";
import { ProjectData } from "@/lib/store";
import { exportProjectToPdf } from "@/services/pdf-export";

/** PDF 导出：合并编辑器当前内容后调用后端生成 PDF */
export function usePdfExport(
  project: ProjectData,
  activeSection: string,
  editingContent: string,
) {
  return useCallback(async () => {
    if (!project) return;
    try {
      toast.info("正在准备 PDF 数据，请稍候…");
      const exportProject = mergeEditorIntoProject(project, activeSection, editingContent);
      await exportProjectToPdf(exportProject);
      toast.success("PDF 导出成功！");
    } catch (error: unknown) {
      console.error("PDF Export Error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`PDF 导出失败: ${msg}`);
    }
  }, [project, activeSection, editingContent]);
}

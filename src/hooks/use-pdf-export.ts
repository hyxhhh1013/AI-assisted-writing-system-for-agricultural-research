import { useCallback } from "react";
import { toast } from "sonner";
import { mergeEditorIntoProject } from "@/lib/export-content";
import type { ProjectData } from "@/contracts/project";
import { exportProjectToPdf } from "@/services/pdf-export";
import { fetchExportReadiness } from "@/services/export-readiness";
import { getErrorMessage } from "@/lib/error-utils";

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

      // 导出前硬检 + bib_only 软告警（与 Word 同路径）
      try {
        const readiness = await fetchExportReadiness(exportProject);
        if (!readiness.ok) {
          toast.error(readiness.gate.hint || "引用编号未通过硬检，暂不可导出 PDF");
          return;
        }
        if (readiness.warnings.length > 0) {
          toast.warning(readiness.warnings.join("\n"));
        }
      } catch (err: unknown) {
        // 就绪 API 失败时仍走服务端硬检；不挡导出
        console.warn("export readiness check skipped:", err);
      }

      await exportProjectToPdf(exportProject);
      toast.success("PDF 导出成功！");
    } catch (error: unknown) {
      console.error("PDF Export Error:", error);
      const msg = error instanceof Error ? getErrorMessage(error) : String(error);
      toast.error(`PDF 导出失败: ${msg}`);
    }
  }, [project, activeSection, editingContent]);
}

import { useEffect } from "react";
import { ProjectData } from "@/lib/store";

/**
 * 实时将编辑器内容同步到 project state（500ms 防抖），确保预览和导出始终最新。
 * 接收外部 projectRef，与 useReferenceReorder / handleApplyAiContent 共享。
 */
export function useEditorSync(
  editingContent: string,
  activeSection: string,
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>,
  projectRef: React.MutableRefObject<ProjectData>,
) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const latestProject = projectRef.current;
      if (!latestProject?.id) return;

      if (activeSection === "abstract") {
        if (latestProject.abstract !== editingContent) {
          setProject((prev) => ({ ...prev, abstract: editingContent }));
        }
      } else {
        if (latestProject.sections[activeSection] !== editingContent) {
          setProject((prev) => ({
            ...prev,
            sections: { ...prev.sections, [activeSection]: editingContent },
          }));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [editingContent, activeSection, setProject, projectRef]);
}

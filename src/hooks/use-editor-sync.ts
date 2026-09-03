import { useEffect } from "react";
import type { ProjectData } from "@/contracts/project";

export function bumpEditorSyncEpoch(epochRef: { current: number }): void {
  epochRef.current += 1;
}

export function editorTextForSection(project: ProjectData, sectionKey: string): string {
  if (sectionKey === "abstract") return project.abstract || "";
  return project.sections[sectionKey] ?? "";
}

/**
 * 实时将编辑器内容同步到 project state（500ms 防抖），确保预览和导出始终最新。
 * 接收外部 projectRef，与 useReferenceReorder / handleApplyAiContent 共享。
 *
 * epochRef：Agent/远端刚写回时 +1，丢弃仍拿着旧编辑器内容的定时器，
 * 避免默认停在「引言」的空稿把刚 persist 的正文盖掉（随后 autosave 还会写回库）。
 */
export function useEditorSync(
  editingContent: string,
  activeSection: string,
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>,
  projectRef: React.MutableRefObject<ProjectData>,
  epochRef?: React.MutableRefObject<number>,
) {
  useEffect(() => {
    const epochAtSchedule = epochRef?.current ?? 0;
    const timer = setTimeout(() => {
      if ((epochRef?.current ?? 0) !== epochAtSchedule) return;
      const latestProject = projectRef.current;
      if (!latestProject?.id) return;

      if (activeSection === "abstract") {
        if (latestProject.abstract !== editingContent) {
          setProject((prev) => ({ ...prev, abstract: editingContent }));
        }
      } else if (latestProject.sections[activeSection] !== editingContent) {
        setProject((prev) => ({
          ...prev,
          sections: { ...prev.sections, [activeSection]: editingContent },
        }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [editingContent, activeSection, setProject, projectRef, epochRef]);
}

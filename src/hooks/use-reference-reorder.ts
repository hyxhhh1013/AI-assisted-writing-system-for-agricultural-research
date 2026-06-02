import { useCallback } from "react";
import { toast } from "sonner";
import { ProjectData, projectStore } from "@/lib/store";
import { mergeEditorIntoProject } from "@/lib/export-content";
import {
  buildReorderedReferences,
  collectCitationFirstAppearance,
  remapBracketCitations,
} from "@/lib/reference-reorder";

interface UseReferenceReorderOptions {
  projectRef: React.RefObject<ProjectData>;
  editingContentRef: React.RefObject<string>;
  activeSectionRef: React.RefObject<string>;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  setEditingContent: React.Dispatch<React.SetStateAction<string>>;
}

export function useReferenceReorder({
  projectRef,
  editingContentRef,
  activeSectionRef,
  setProject,
  setEditingContent,
}: UseReferenceReorderOptions) {
  return useCallback(async () => {
    const currentProject = projectRef.current;
    const currentEditingContent = editingContentRef.current;
    const currentActiveSection = activeSectionRef.current;
    if (!currentProject || !currentProject.references || currentProject.references.length === 0) {
      toast.error("暂无参考文献可重排");
      return;
    }

    const merged = mergeEditorIntoProject(currentProject, currentActiveSection, currentEditingContent);
    const abstractScan = merged.abstract || "";
    const sectionScan = (id: string) => merged.sections[id] || "";

    const allContent = [
      abstractScan,
      sectionScan("introduction"),
      sectionScan("methods"),
      sectionScan("results"),
      sectionScan("conclusion"),
    ].join("\n\n");

    const appearanceOrder = collectCitationFirstAppearance(allContent, currentProject.references.length);
    if (appearanceOrder.length === 0) {
      toast.info("未在正文中检测到有效引用编号（含当前编辑区）");
      return;
    }

    const built = buildReorderedReferences(appearanceOrder, currentProject.references, { includeUncited: true });
    if (!built) { toast.error("重排计算失败"); return; }

    const { references: newRefs, indexMap } = built;
    const nextAbstract = remapBracketCitations(abstractScan, indexMap);
    const updatedSections = { ...currentProject.sections };
    (["introduction", "methods", "results", "conclusion"] as const).forEach((id) => {
      updatedSections[id] = remapBracketCitations(sectionScan(id), indexMap);
    });

    const updatedProject: ProjectData = {
      ...currentProject,
      abstract: nextAbstract,
      references: newRefs,
      sections: updatedSections,
    };

    setProject(updatedProject);
    setEditingContent(
      currentActiveSection === "abstract"
        ? nextAbstract
        : updatedSections[currentActiveSection as keyof typeof updatedSections] || ""
    );
    await projectStore.replaceReferences(currentProject.id, newRefs);
    await projectStore.save(updatedProject);
    toast.success(`已按正文引用顺序重排 ${newRefs.length} 条参考文献`);
  }, [projectRef, editingContentRef, activeSectionRef, setProject, setEditingContent]);
}

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";

type WorkbenchTab = "structure" | "data" | "outline" | "writing" | "reader" | "plagiarism" | "xrd";

interface UseProjectLoaderOptions {
  setProject: (p: ProjectData) => void;
  setEditingContent: (c: string) => void;
  setExpandedOutlineSections: (s: string[]) => void;
  setActiveTab: (t: WorkbenchTab) => void;
  activeSection: string;
  isWorkbenchTab: (v: string | null) => v is WorkbenchTab;
}

export function useProjectLoader({
  setProject,
  setEditingContent,
  setExpandedOutlineSections,
  setActiveTab,
  activeSection,
  isWorkbenchTab,
}: UseProjectLoaderOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  useEffect(() => {
    const initProject = async () => {
      if (!projectId) {
        const lastId = projectStore.getCurrentId();
        if (lastId) {
          router.replace(`/workbench?id=${lastId}${searchParams.get("tab") ? `&tab=${searchParams.get("tab")}` : ""}`);
        } else {
          router.replace("/projects");
        }
        return;
      }

      const data = await projectStore.get(projectId);
      if (data) {
        setProject(data);
        setEditingContent(data.sections[activeSection] || "");
        if (data.expandedOutlineSections) {
          setExpandedOutlineSections(data.expandedOutlineSections);
        }

        const tab = searchParams.get("tab");
        if (tab === "analysis" || tab === "evidence") {
          setActiveTab("data");
        } else if (isWorkbenchTab(tab)) {
          setActiveTab(tab);
        }
      } else {
        toast.error("未找到项目数据，正在返回列表");
        router.replace("/projects");
      }
    };

    initProject();
  }, [projectId]);
}

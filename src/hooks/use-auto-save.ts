import { useEffect } from "react";
import { ProjectData, projectStore } from "@/lib/store";

/** 每 10 秒自动保存 project 到本地存储 */
export function useAutoSave(project: ProjectData, projectId: string | null | undefined) {
  useEffect(() => {
    if (!projectId || !project?.id) return;
    const timer = setTimeout(async () => {
      await projectStore.save(project);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [project, projectId]);
}

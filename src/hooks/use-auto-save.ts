import { useEffect, useRef } from "react";
import { ProjectData, projectStore } from "@/lib/store";

/** 每 10 秒检测变更并自动保存（仅在内容实际变化时保存） */
export function useAutoSave(project: ProjectData, projectId: string | null | undefined) {
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    if (!projectId || !project?.id) return;

    const timer = setTimeout(async () => {
      const current = JSON.stringify(project);
      if (current === lastSavedRef.current) return; // 无变化，跳过
      lastSavedRef.current = current;
      try {
        await projectStore.save(project);
      } catch {
        // 保存失败静默忽略，下次重试
      }
    }, 10_000);

    return () => clearTimeout(timer);
  }, [project, projectId]);
}

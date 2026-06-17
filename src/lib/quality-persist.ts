import { patchSection } from "@/services/review";
import { projectStore } from "@/lib/store";
import type { QualitySection } from "@/lib/quality-sections";

/** 将变更章节写回项目（摘要走 project.abstract，其余走 section PATCH） */
export async function persistQualitySections(
  projectId: string,
  before: QualitySection[],
  after: QualitySection[],
  changedKeys: string[],
): Promise<void> {
  const uniqueKeys = [...new Set(changedKeys)];
  for (const key of uniqueKeys) {
    const prev = before.find((s) => s.key === key);
    const next = after.find((s) => s.key === key);
    if (!prev || !next || prev.content === next.content) continue;

    if (key === "abstract") {
      await projectStore.update(projectId, { abstract: next.content });
    } else {
      await patchSection(projectId, key, next.content);
    }
  }
}

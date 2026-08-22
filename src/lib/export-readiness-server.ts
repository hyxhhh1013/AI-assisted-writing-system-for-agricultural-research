/**
 * 导出就绪检查（服务端）：解析 bib_only 后再跑硬检 + 软告警。
 * 禁止被 Client Component / hooks 直接 import（会拉进 rag → fs）。
 */

import type { ProjectData } from "@/contracts/project";
import {
  assessExportReadiness,
  type ExportReadiness,
} from "@/lib/export-readiness";
import { resolveBibOnlyIndexes } from "@/lib/reference-mode";

/**
 * 服务端：解析项目 bib_only 编号后再做就绪检查。
 * 解析失败时降级为无 soft 告警（硬检仍执行）。
 */
export async function assessExportReadinessAsync(
  project: ProjectData,
  opts?: { projectId?: string; userId?: string },
): Promise<ExportReadiness> {
  const projectId = opts?.projectId ?? project.id;
  let bibOnlyIndexes: Set<number> | undefined;
  if (projectId) {
    try {
      bibOnlyIndexes = await resolveBibOnlyIndexes(projectId, opts?.userId);
    } catch {
      bibOnlyIndexes = undefined;
    }
  }
  return assessExportReadiness(project, { bibOnlyIndexes });
}

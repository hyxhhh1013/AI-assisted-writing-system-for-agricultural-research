/** 备料层 Handoff：创建带 P0/P1 的项目 */

import {
  createInitialPaperPassport,
  paperConfigToRecord,
  serializePaperPassport,
  type PaperConfigRecord,
} from "@/contracts/paper-passport";
import { patchReferences, syncPaperPassport } from "@/services/project";
import { MIN_REVIEW_HANDOFF_ENTRIES } from "@/contracts/direction-literature";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

export interface CreateProjectHandoffInput {
  config: PaperConfigRecord;
  references?: string[];
  /** 向导第 3 步前创建空项目（综述稍后再导入文献） */
  allowEmptyReferences?: boolean;
}

export async function createProjectWithHandoff(
  input: CreateProjectHandoffInput,
): Promise<{ projectId: string }> {
  const { config, references = [], allowEmptyReferences = false } = input;
  const mode: ProjectWritingMode = config.paperType;

  if (
    mode === "review"
    && !allowEmptyReferences
    && references.length < MIN_REVIEW_HANDOFF_ENTRIES
  ) {
    throw new Error(
      `综述项目至少需要 ${MIN_REVIEW_HANDOFF_ENTRIES} 篇参考文献，当前 ${references.length} 篇`,
    );
  }

  const paperPassport = serializePaperPassport(
    createInitialPaperPassport(config),
  );

  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: config.paperTitle,
      mode: config.paperType,
      language: config.language,
      citationStyle: config.citationStyle,
      paperPassport,
    }),
  });
  const createData = await createRes.json().catch(() => ({})) as { id?: string; error?: string };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error || "创建项目失败");
  }

  const projectId = createData.id;

  if (references.length > 0) {
    const ops = references.map((content, index) => ({
      op: "create" as const,
      content,
      index,
    }));
    await patchReferences(projectId, ops);
  }

  await syncPaperPassport(projectId);

  return { projectId };
}

export function buildConfigFromWizard(
  paperTitle: string,
  paperType: "review" | "research",
  language: "zh" | "en",
  targetJournal: string,
  wordCount: string,
  citationStyle: PaperConfigRecord["citationStyle"],
): PaperConfigRecord {
  return paperConfigToRecord({
    paperTitle: paperTitle.trim() || "未命名项目",
    paperType,
    targetJournal: targetJournal.trim(),
    wordCount,
    language,
    citationStyle,
  });
}

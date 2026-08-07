/** 备料层 Handoff：创建带 P0/P1 的项目 */

import {
  createInitialPaperPassport,
  paperConfigToRecord,
  serializePaperPassport,
  type PaperConfigRecord,
} from "@/contracts/paper-passport";
import { patchReferences, syncPaperPassport } from "@/services/project";

export interface CreateProjectHandoffInput {
  config: PaperConfigRecord;
  references?: string[];
}

/**
 * 创建项目并做初始备料（同步 paper passport）。
 * 不再强制参考文献：0 篇也可创建，Agent 在工作台 phase 1 检索/导入文献。
 */
export async function createProjectWithHandoff(
  input: CreateProjectHandoffInput,
): Promise<{ projectId: string }> {
  const { config, references = [] } = input;

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
  agentEntryMode?: PaperConfigRecord["agentEntryMode"],
): PaperConfigRecord {
  return paperConfigToRecord({
    paperTitle: paperTitle.trim() || "未命名项目",
    paperType,
    targetJournal: targetJournal.trim(),
    wordCount,
    language,
    citationStyle,
    ...(agentEntryMode ? { agentEntryMode } : {}),
  });
}

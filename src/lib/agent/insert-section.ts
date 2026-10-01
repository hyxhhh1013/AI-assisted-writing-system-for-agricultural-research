/**
 * 图表 / 三线表插入章节：缺省 sectionKey 时落到已有正文，并回看确认。
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  type AgentWritingSectionKey,
} from "@/lib/agent/writing-sections";
import { appendAgentSectionMarkdown } from "@/lib/agent/project-persist";
import prisma from "@/lib/prisma";

const PREFERRED_INSERT: readonly AgentWritingSectionKey[] = [
  "results",
  "methods",
  "discussion",
  "literature_body",
  "background",
  "introduction",
];

export function parseExplicitInsertSectionKey(
  raw: unknown,
): { ok: true; key?: AgentWritingSectionKey } | { ok: false; error: string } {
  const sectionKeyRaw = raw != null ? String(raw).trim() : "";
  if (!sectionKeyRaw) return { ok: true, key: undefined };
  if (isAgentWritingSectionKey(sectionKeyRaw)) return { ok: true, key: sectionKeyRaw };
  return {
    ok: false,
    error: `无效 sectionKey: ${sectionKeyRaw}。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
  };
}

/** 已有正文的节优先；否则研究论文 results、综述 literature_body。 */
export function inferInsertSectionKey(
  snapshot: AgentProjectSnapshot | null | undefined,
): AgentWritingSectionKey {
  const fills = snapshot?.sectionFills ?? [];
  const byKey = new Map(fills.map((f) => [f.key, f.chars]));
  for (const key of PREFERRED_INSERT) {
    if ((byKey.get(key) ?? 0) > 0) return key;
  }
  const nonempty = fills.find((f) => f.key !== "abstract" && f.chars > 0);
  if (nonempty && isAgentWritingSectionKey(nonempty.key)) return nonempty.key;
  return snapshot?.mode === "review" ? "literature_body" : "results";
}

export function resolveInsertSectionKey(
  explicit: unknown,
  snapshot: AgentProjectSnapshot | null | undefined,
): { sectionKey: AgentWritingSectionKey; inferred: boolean } | { error: string } {
  const parsed = parseExplicitInsertSectionKey(explicit);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.key) return { sectionKey: parsed.key, inferred: false };
  return { sectionKey: inferInsertSectionKey(snapshot), inferred: true };
}

export function assetLandedInBody(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as {
    insertedSection?: unknown;
    insertMode?: unknown;
    verifiedInBody?: unknown;
    charts?: unknown;
  };
  if (typeof d.insertedSection === "string" && d.insertedSection.trim()) return true;
  if (d.insertMode === "appended" || d.insertMode === "replaced") return true;
  if (d.verifiedInBody === true) return true;
  if (Array.isArray(d.charts)) {
    return d.charts.some((c) => assetLandedInBody(c));
  }
  return false;
}

export async function readSectionMarkdown(
  projectId: string,
  sectionKey: string,
): Promise<string> {
  if (sectionKey === "abstract") {
    const row = await prisma.project.findUnique({
      where: { id: projectId },
      select: { abstract: true },
    });
    return row?.abstract ?? "";
  }
  const row = await prisma.section.findUnique({
    where: { projectId_key: { projectId, key: sectionKey } },
    select: { content: true },
  });
  return row?.content ?? "";
}

export async function appendSectionAndVerify(input: {
  userId: string;
  projectId: string;
  sectionKey: string;
  markdown: string;
  needle: string;
}): Promise<{
  insertedSection: string;
  verifiedInBody: boolean;
  bodyExcerpt: string;
}> {
  await appendAgentSectionMarkdown(
    input.userId,
    input.projectId,
    input.sectionKey,
    input.markdown,
  );
  return verifySectionContains(input.projectId, input.sectionKey, input.needle);
}

export async function verifySectionContains(
  projectId: string,
  sectionKey: string,
  needle: string,
): Promise<{
  insertedSection: string;
  verifiedInBody: boolean;
  bodyExcerpt: string;
}> {
  const content = await readSectionMarkdown(projectId, sectionKey);
  const token = needle.trim();
  const verifiedInBody = token.length > 0 && content.includes(token);
  const excerpt = content.slice(Math.max(0, content.length - 900));
  return {
    insertedSection: sectionKey,
    verifiedInBody,
    bodyExcerpt: excerpt,
  };
}

export function formatInsertSummary(opts: {
  inferred: boolean;
  insertedSection?: string;
  verifiedInBody?: boolean;
  libraryOnly?: boolean;
}): string {
  if (opts.libraryOnly || !opts.insertedSection) {
    return "未插入正文。必须带 sectionKey 再调一次，禁止口头说已经插进论文。";
  }
  const infer = opts.inferred ? "（缺省落入该节）" : "";
  const seen = opts.verifiedInBody === false
    ? "；回看未在正文找到标记，请 read_section 核对"
    : "；已回看正文含该表/图";
  return `已插入章节 ${opts.insertedSection}${infer}${seen}`;
}

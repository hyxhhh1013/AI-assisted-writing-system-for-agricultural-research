/**
 * 已写正文的确定性稿面扫描。
 * 写节热路径只看「这一次」；这里扫落库全文，用来发现用户没点名的洞。
 */

import type {
  ManuscriptAuditIssue,
  ManuscriptAuditReport,
} from "@/contracts/manuscript-audit";
import { slimManuscriptAudit } from "@/contracts/manuscript-audit";
import { evaluateSectionWritingQa } from "@/lib/agent/writing-qa-run";
import { manuscriptSubsectionTitle } from "@/lib/writing-merge";
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";
import { stripLeadingEnumeration } from "@/lib/academic-numbering";
import prisma from "@/lib/prisma";
import { isSoftGroundable } from "@/lib/reference-evidence";
import type { SoftReferenceEvidence } from "@/contracts/project";

const MAX_ISSUES = 12;
const SKIP_QA_CODES = new Set(["sentence_monotone", "para_monotone"]);
const GENERIC_OUTLINE_LEAVES = new Set([
  "引言",
  "结论",
  "摘要",
  "参考文献",
  "introduction",
  "conclusion",
  "abstract",
  "references",
]);

export interface AuditManuscriptInput {
  mode?: "review" | "research";
  outline?: string;
  sections: Record<string, string>;
  maxRefIndex?: number;
  softRefs?: ReadonlyArray<{ n: number; abstract: string }>;
}

function pushIssue(
  issues: ManuscriptAuditIssue[],
  issue: ManuscriptAuditIssue,
): void {
  if (issues.length >= MAX_ISSUES) return;
  issues.push(issue);
}

function collectCiteCounts(text: string): Map<number, number> {
  const counts = new Map<number, number>();
  const normalized = normalizeAllCitationFormats(text);
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    for (const n of expandCitationGroup(m[1])) {
      if (n < 1) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return counts;
}

const HEADING_RE =
  /(?:^|\n)(?:#{1,3}\s*)?(\d+\.\d+(?:\.\d+)?)[ \t]+([^\n]+)/g;

function collectHeadings(
  text: string,
): Array<{ num: string; leaf: string }> {
  const out: Array<{ num: string; leaf: string }> = [];
  const re = new RegExp(HEADING_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const leaf = manuscriptSubsectionTitle(m[2] ?? "");
    if (leaf.length < 2) continue;
    out.push({ num: m[1] ?? "", leaf });
  }
  return out;
}

function collectOutlineLeaves(outline: string): string[] {
  const leaves: string[] = [];
  for (const raw of outline.split(/\n/)) {
    const line = raw.trim();
    const m = line.match(/^\d+\.\d+(?:\.\d+)?\s+(.+)$/);
    if (!m) continue;
    const leaf = stripLeadingEnumeration(m[1] ?? "").trim();
    if (leaf.length < 4) continue;
    if (GENERIC_OUTLINE_LEAVES.has(leaf.toLowerCase())) continue;
    leaves.push(leaf);
  }
  return leaves;
}

function collectQaIssues(
  sections: Record<string, string>,
  maxRefIndex: number | undefined,
  softRefs: AuditManuscriptInput["softRefs"],
): ManuscriptAuditIssue[] {
  const issues: ManuscriptAuditIssue[] = [];
  for (const [key, text] of Object.entries(sections)) {
    if (!text.trim()) continue;
    const report = evaluateSectionWritingQa({
      text,
      sectionKey: key,
      maxRefIndex,
      softRefs,
    });
    for (const f of report.findings) {
      if (SKIP_QA_CODES.has(f.code)) continue;
      pushIssue(issues, {
        code: f.code,
        severity: f.action === "block" || f.action === "repair" ? f.action : "warn",
        sectionKey: key,
        message: f.message,
        examples: f.examples,
      });
    }
  }
  return issues;
}

export function auditManuscript(input: AuditManuscriptInput): ManuscriptAuditReport {
  const sections = input.sections;
  const issues: ManuscriptAuditIssue[] = [];

  for (const issue of collectQaIssues(sections, input.maxRefIndex, input.softRefs)) {
    pushIssue(issues, issue);
  }

  const byLeaf = new Map<string, string[]>();
  for (const [key, text] of Object.entries(sections)) {
    for (const h of collectHeadings(text)) {
      const nums = byLeaf.get(h.leaf) ?? [];
      nums.push(`${key}:${h.num}`);
      byLeaf.set(h.leaf, nums);
    }
  }
  for (const [leaf, nums] of byLeaf) {
    const uniq = [...new Set(nums)];
    if (uniq.length < 2) continue;
    pushIssue(issues, {
      code: "duplicate_subsection_title",
      severity: "repair",
      message: `子节「${leaf}」出现 ${uniq.length} 次（${uniq.slice(0, 4).join("、")}），应覆盖旧稿而不是叠两份`,
      examples: uniq.slice(0, 3),
    });
  }

  for (const [key, text] of Object.entries(sections)) {
    const hit = text.split("\n").find((line) =>
      />/.test(line) && /\d+\.\d+/.test(line) && line.includes(">"),
    );
    if (!hit) continue;
    pushIssue(issues, {
      code: "path_breadcrumb",
      severity: "repair",
      sectionKey: key,
      message: "正文里还粘着蓝图路径（父 > 子），应只留叶子标题",
      examples: [hit.trim().slice(0, 80)],
    });
  }

  const bg = (sections.background ?? "").replace(/\s+/g, "").length;
  const lit = (sections.literature_body ?? "").replace(/\s+/g, "").length;
  if ((input.mode ?? "research") === "review" && lit < 80 && bg >= 800) {
    pushIssue(issues, {
      code: "review_body_skipped",
      severity: "repair",
      sectionKey: "literature_body",
      message: `综述正文仍空（${lit} 字）但背景已写 ${bg} 字，用户要的综述章还没落上`,
    });
  }

  const allText = Object.values(sections).join("\n");
  const citeCounts = collectCiteCounts(allText);
  const citeTotal = [...citeCounts.values()].reduce((a, b) => a + b, 0);
  const refN = input.maxRefIndex ?? 0;
  if (citeTotal >= 8 && refN >= 8 && citeCounts.size >= 3) {
    const top = [...citeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topSum = top.reduce((a, [, n]) => a + n, 0);
    if (topSum / citeTotal >= 0.7) {
      pushIssue(issues, {
        code: "cite_concentration",
        severity: "warn",
        message: `正文 ${citeTotal} 处引用里 ${topSum} 处堆在 ${top
          .map(([n]) => `[${n}]`)
          .join("")}，像改号堆到少数篇上`,
        examples: top.map(([n, c]) => `[${n}]×${c}`),
      });
    }
  }

  if (input.outline?.trim()) {
    const bodyNorm = allText.replace(/\s+/g, "");
    const missing: string[] = [];
    for (const leaf of collectOutlineLeaves(input.outline)) {
      const compact = leaf.replace(/\s+/g, "");
      if (compact.length >= 4 && !bodyNorm.includes(compact)) {
        missing.push(leaf);
      }
    }
    if (missing.length > 0) {
      pushIssue(issues, {
        code: "outline_heading_unwritten",
        severity: "warn",
        message: `大纲有 ${missing.length} 个二级标题未在正文出现：${missing.slice(0, 4).join("、")}`,
        examples: missing.slice(0, 3),
      });
    }
  }

  const repairCount = issues.filter((i) => i.severity === "repair" || i.severity === "block").length;
  const codes = [...new Set(issues.map((i) => i.code))].slice(0, 6);
  const summary =
    issues.length === 0
      ? "稿面扫描未发现确定性缺陷"
      : `稿面扫描 ${issues.length} 条（须处理 ${repairCount}）：${codes.join("、")}`;
  return slimManuscriptAudit({
    issueCount: issues.length,
    repairCount,
    issues,
    summary,
  });
}

export async function auditBoundProjectManuscript(input: {
  userId: string;
  projectId: string;
  mode: "review" | "research";
  outline: string;
  references: string[];
  referenceEvidence?: SoftReferenceEvidence[];
  overlay?: { key: string; text: string };
}): Promise<ManuscriptAuditReport> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: {
      abstract: true,
      sections: { select: { key: true, content: true } },
    },
  });
  const sections: Record<string, string> = {};
  for (const row of project?.sections ?? []) {
    if (row.content?.trim()) sections[row.key] = row.content;
  }
  if (project?.abstract?.trim()) sections.abstract = project.abstract;
  if (input.overlay?.text.trim()) {
    sections[input.overlay.key] = input.overlay.text;
  }
  const softRefs: { n: number; abstract: string }[] = [];
  for (const ev of input.referenceEvidence ?? []) {
    if (!isSoftGroundable(ev.abstract) || !ev.abstract) continue;
    softRefs.push({ n: ev.index, abstract: ev.abstract });
  }
  return auditManuscript({
    mode: input.mode,
    outline: input.outline,
    sections,
    maxRefIndex: input.references.length,
    softRefs,
  });
}

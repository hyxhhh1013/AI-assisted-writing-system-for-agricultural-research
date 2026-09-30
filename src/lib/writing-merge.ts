/**
 * 段落扩写追加、子节写回合并。禁止用新稿整节覆盖已有正文。
 */

import {
  majorNumberFromSectionId,
  maxSecondLevelInText,
} from "@/lib/academic-numbering";

const STUB_BODY_CHARS = 24;

export function subsectionHeadingPattern(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|\\n)(?:#{1,3}\\s*)?(?:\\d+\\.?\\d*(?:\\.?\\d+)?\\s*)?${escaped}\\s*\\n`,
    "i",
  );
}

export function stripLeadingMatchingHeading(
  content: string,
  subsectionTitle: string,
): string {
  const trimmed = content.trim();
  const firstLine = trimmed.split("\n")[0]?.trim() || "";
  const firstLineBody = firstLine.replace(/^\d+(?:\.\d+)*\s*/, "").trim();
  if (firstLineBody !== subsectionTitle.trim()) return trimmed;
  const firstNl = trimmed.indexOf("\n");
  return firstNl !== -1 ? trimmed.slice(firstNl + 1).trimStart() : "";
}

/** 模型若整段重写则沿用新稿；否则保留原文并接上新增。 */
export function composeExpandedParagraph(original: string, generated: string): string {
  const o = original.trim();
  const g = generated.trim();
  if (!g) return original;
  if (!o) return generated;
  if (g === o) return original;
  if (g.startsWith(o) && g.length > o.length + 8) return g;
  const firstPara = g.split(/\n\n+/)[0]?.trim() ?? "";
  if (firstPara === o) return g;
  return `${o}\n\n${g}`;
}

export function mergeSubsectionIntoSection(input: {
  existingText: string;
  incoming: string;
  subsectionTitle: string;
  sectionKey?: string;
  appendIfPresent?: boolean;
}): string {
  const existingText = input.existingText;
  const subsectionTitle = input.subsectionTitle.trim();
  const appendIfPresent = input.appendIfPresent !== false;
  const processed = input.incoming;
  const headingPattern = subsectionHeadingPattern(subsectionTitle);
  const match = existingText.match(headingPattern);
  const contentToInsert = stripLeadingMatchingHeading(processed, subsectionTitle);

  if (match && match.index !== undefined) {
    const headingEnd = match.index + match[0].length;
    const afterMatch = existingText.slice(headingEnd);
    const nextHeadingMatch = afterMatch.match(/\n(?:#{1,3} |\d+\.\d+(?:\.\d+)?\s)/);
    const endIdx = nextHeadingMatch
      ? headingEnd + nextHeadingMatch.index!
      : existingText.length;
    const existingBody = existingText.slice(headingEnd, endIdx);
    const tail = existingText.slice(endIdx);
    if (appendIfPresent && existingBody.replace(/\s+/g, "").length >= STUB_BODY_CHARS) {
      const mid = `${existingBody.trimEnd()}\n\n${contentToInsert}\n\n`;
      return existingText.slice(0, headingEnd) + mid + tail;
    }
    return `${existingText.slice(0, headingEnd)}${contentToInsert}\n\n${tail}`;
  }

  const major = input.sectionKey
    ? majorNumberFromSectionId(input.sectionKey)
    : null;
  let heading = "";
  const firstLine = processed.trim().split("\n")[0]?.trim() || "";
  const firstLineBody = firstLine.replace(/^\d+(?:\.\d+)*\s*/, "").trim();
  const aiStartsWithMatchingHeading = firstLineBody === subsectionTitle;
  if (major != null) {
    const nextSub = maxSecondLevelInText(existingText, major) + 1;
    heading = aiStartsWithMatchingHeading ? "" : `${major}.${nextSub} ${subsectionTitle}`;
  } else {
    heading = aiStartsWithMatchingHeading ? "" : `### ${subsectionTitle}`;
  }
  const newBlock = heading ? `${heading}\n${contentToInsert}` : contentToInsert;
  const trailingStubRe = new RegExp(
    `(?:\\n|^)(?:#{1,3}\\s*)?(?:\\d+\\.?\\d*(?:\\.\\d+)?\\s*)?${
      subsectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }\\s*$`,
    "i",
  );
  const baseText = existingText.trim().replace(trailingStubRe, "").trim();
  return baseText ? `${baseText}\n\n${newBlock}` : newBlock;
}

import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { parseWritingBlueprint } from "@/contracts/writing-blueprint";
import { capOutlinePreview } from "@/lib/agent/outline-review";

export const BLUEPRINT_REVISE_CHIPS = [
  {
    id: "tighten-claim",
    label: "某节主张再收一收",
    note: "请把过宽的节主张收成可检验的一句话，并补证据提示。",
  },
  {
    id: "fewer-figures",
    label: "配图再少一点",
    note: "配图计划偏多，请只保留必要图，其余标成 optional 或删掉。",
  },
  {
    id: "order",
    label: "调整写作顺序",
    note: "请按更顺的叙事重排 writingOrder，并说明先写哪一节。",
  },
  {
    id: "words",
    label: "词数分配再平衡",
    note: "词数分配不合理，请按各节负担重排 min/max。",
  },
] as const;

export function formatBlueprintPreview(bp: WritingBlueprint): string {
  const lines: string[] = [
    `# ${bp.thesis.trim() || "写作蓝图"}`,
    "",
  ];
  if (bp.narrativeSummary.trim()) {
    lines.push(bp.narrativeSummary.trim(), "");
  }
  lines.push(
    `词数 ${bp.estimatedWordCount.min}–${bp.estimatedWordCount.max}`,
    `配图 ${bp.figurePlan.totalMin}–${bp.figurePlan.totalMax}（已规划 ${bp.figurePlan.items.length} 项）`,
    "",
    "## 各节要点",
  );
  for (const g of bp.sectionGuides) {
    lines.push(`### ${g.sectionPath}`);
    if (g.claim?.trim()) lines.push(`主张：${g.claim.trim()}`);
    if (g.purpose?.trim()) lines.push(g.purpose.trim());
    if (g.keyPoints.length > 0) {
      for (const p of g.keyPoints.slice(0, 4)) lines.push(`- ${p}`);
    }
    lines.push("");
  }
  if (bp.figurePlan.items.length > 0) {
    lines.push("## 配图计划");
    for (const item of bp.figurePlan.items) {
      lines.push(`- ${item.sectionPath} · ${item.type} · ${item.purpose}`);
    }
  }
  return lines.join("\n").trim();
}

export function blueprintPreviewFromToolData(data: unknown, fallback = ""): string {
  if (data && typeof data === "object") {
    const rec = data as { preview?: unknown; blueprint?: unknown };
    if (typeof rec.preview === "string" && rec.preview.trim()) return rec.preview;
    if (typeof rec.blueprint === "string") {
      const parsed = parseWritingBlueprint(rec.blueprint);
      if (parsed) return formatBlueprintPreview(parsed);
    }
  }
  return fallback;
}

export function pickBlueprint(
  preview?: string,
  projectBlueprintJson?: string | null,
): { blueprint: WritingBlueprint | null; text: string } {
  const fromProject = parseWritingBlueprint(projectBlueprintJson);
  if (fromProject) {
    return { blueprint: fromProject, text: formatBlueprintPreview(fromProject) };
  }
  const text = preview?.trim() ?? "";
  return { blueprint: parseWritingBlueprint(text), text };
}

export function capBlueprintPreview(text: string): string {
  return capOutlinePreview(text);
}

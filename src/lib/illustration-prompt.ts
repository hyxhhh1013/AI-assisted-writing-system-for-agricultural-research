import type { IllustrationPromptV1 } from "@/contracts/illustration";
import type { MechanismSpecV1 } from "@/contracts/mechanism-spec";
import { decodeFigureSpecParam } from "@/contracts/figure";

const NEGATIVE =
  "photorealistic, 3d render, extra arrows, extra boxes, extra labels, "
  + "watermark, logo, signature, messy overlapping text, handwritten, "
  + "unreadable letters, invented pathways, cartoon mascot";

function uniqueText(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function visibleTextFromMechanismSpec(spec: MechanismSpecV1): string[] {
  const bits: string[] = [...spec.visibleText];
  if (spec.graph) {
    for (const n of spec.graph.nodes) bits.push(n.label);
    for (const e of spec.graph.edges) {
      if (e.label) bits.push(e.label);
    }
  }
  if (spec.panels) {
    for (const p of spec.panels) {
      bits.push(p.title);
      for (const n of p.graph.nodes) bits.push(n.label);
      for (const e of p.graph.edges) {
        if (e.label) bits.push(e.label);
      }
      if (p.bullets) bits.push(...p.bullets);
    }
  }
  return uniqueText(bits);
}

export function compileIllustrationPrompt(spec: MechanismSpecV1): IllustrationPromptV1 {
  const visibleText = visibleTextFromMechanismSpec(spec);
  return compileIllustrationPromptFromParts({
    claim: spec.claim,
    caption: spec.caption,
    visibleText,
    layout: spec.layout,
    kind: spec.kind,
  });
}

export function compileIllustrationPromptFromParts(input: {
  claim: string;
  caption: string;
  visibleText: string[];
  layout?: string;
  kind?: string;
}): IllustrationPromptV1 {
  const visibleText = uniqueText(input.visibleText);
  const layoutBit =
    input.kind === "mechanism_panel"
      ? "multi-panel scientific schematic (a/b/c), aligned columns"
      : input.layout === "fork"
        ? "fork-and-merge flowchart schematic"
        : "single-column process flowchart schematic";

  const prompt = [
    "Redraw this scientific mechanism schematic for a journal (Nature/ACS print quality).",
    `Layout: ${layoutBit}. White background, thin black lines, muted earth/green palette, no decoration.`,
    "Preserve the exact topology of the reference image: same nodes, same arrows, same branching.",
    "Do not invent extra steps, reagents, or products.",
    input.claim
      ? `Scientific claim (do not add as a new box unless already present): ${input.claim}`
      : "",
    input.caption ? `Figure caption context: ${input.caption}` : "",
    visibleText.length
      ? `Every label in the figure must be copied exactly from this list (Chinese allowed, no translation):\n${
        visibleText.map((t) => `- ${t}`).join("\n")
      }`
      : "Keep all existing labels in the reference image unchanged.",
    "Typography: clean sans-serif, high contrast, no overlapping text.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    version: 1,
    prompt,
    negativePrompt: NEGATIVE,
    visibleText,
    claim: input.claim,
    caption: input.caption,
  };
}

/** 结构图资产只有 FigureSpec 时，从 config 抠可见文字 */
export function compileIllustrationPromptFromFigureSpecEnc(
  encoded: string | undefined,
  fallbackCaption: string,
): IllustrationPromptV1 | null {
  if (!encoded) return null;
  const spec = decodeFigureSpecParam(encoded);
  if (!spec) return null;
  const visible = labelsFromUnknown(spec.config);
  return compileIllustrationPromptFromParts({
    claim: fallbackCaption,
    caption: spec.caption || fallbackCaption,
    visibleText: visible,
    kind: spec.tool === "mechanism_panel" ? "mechanism_panel" : "flow",
  });
}

function labelsFromUnknown(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") {
    const t = value.trim();
    return t.length >= 2 && t.length <= 80 ? [t] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => labelsFromUnknown(item, depth + 1));
  }
  if (typeof value !== "object") return [];
  const rec = value as Record<string, unknown>;
  const keys = ["label", "title", "text", "caption", "from", "to"];
  const out: string[] = [];
  for (const k of keys) {
    if (typeof rec[k] === "string") out.push(rec[k] as string);
  }
  if (Array.isArray(rec.nodes)) out.push(...labelsFromUnknown(rec.nodes, depth + 1));
  if (Array.isArray(rec.edges)) out.push(...labelsFromUnknown(rec.edges, depth + 1));
  if (Array.isArray(rec.panels)) out.push(...labelsFromUnknown(rec.panels, depth + 1));
  if (Array.isArray(rec.steps)) out.push(...labelsFromUnknown(rec.steps, depth + 1));
  return out;
}

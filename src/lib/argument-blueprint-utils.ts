import type { ArgumentBlueprint, ArgumentClaim } from "@/contracts/argument-blueprint";

const ARGUMENT_SECTION_HINT_HEAD = "【论证蓝图·本节】";
const ARGUMENT_GLOBAL_HINT_HEAD = "【论证蓝图摘要】";

function normalizePath(path: string): string {
  return path.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 按章节路径匹配 claim（路径包含或标题命中） */
export function findClaimsForSection(
  blueprint: ArgumentBlueprint,
  sectionFullPath: string,
): ArgumentClaim[] {
  const target = normalizePath(sectionFullPath);
  if (!target) return [];
  const leaf = target.split(" > ").pop() ?? target;
  return blueprint.claims.filter((c) => {
    if (!c.sectionPath?.trim()) return false;
    const sp = normalizePath(c.sectionPath);
    return target.includes(sp) || sp.includes(leaf) || leaf.includes(sp);
  });
}

export function stripArgumentSectionHint(context: string): string {
  const marker = `\n${ARGUMENT_SECTION_HINT_HEAD}`;
  const idx = context.indexOf(marker);
  if (idx === -1) {
    if (context.startsWith(ARGUMENT_SECTION_HINT_HEAD)) return "";
    return context.trimEnd();
  }
  return context.slice(0, idx).trimEnd();
}

/** 注入扩写上下文的本节论证要点 */
export function formatArgumentSectionHint(
  blueprint: ArgumentBlueprint,
  sectionFullPath: string,
): string {
  if (!blueprint.confirmedAt) return "";
  const claims = findClaimsForSection(blueprint, sectionFullPath);
  if (claims.length === 0) return "";

  const parts: string[] = [ARGUMENT_SECTION_HINT_HEAD];
  for (const c of claims.slice(0, 4)) {
    parts.push(`- 论断：${c.claim}`);
    if (c.evidence.length > 0) {
      parts.push(`  证据要点：${c.evidence.slice(0, 4).join("；")}`);
    }
    if (c.counterArgument?.trim()) {
      parts.push(`  反方/局限：${c.counterArgument.trim()}`);
    }
    if (c.response?.trim()) {
      parts.push(`  回应：${c.response.trim()}`);
    }
  }
  return `${parts.join("\n")}\n`;
}

export function applyArgumentSectionHintToContext(
  context: string,
  blueprint: ArgumentBlueprint | null | undefined,
  sectionFullPath: string,
): string {
  const base = stripArgumentSectionHint(context);
  if (!blueprint || !sectionFullPath.trim()) return base;
  const hint = formatArgumentSectionHint(blueprint, sectionFullPath);
  if (!hint.trim()) return base;
  return base ? `${base}\n${hint}` : hint.trimEnd();
}

/** 注入 Writer 全局背景 */
export function formatArgumentGlobalSummary(blueprint: ArgumentBlueprint): string {
  if (!blueprint.confirmedAt && !blueprint.thesis.trim()) return "";
  const lines = [
    ARGUMENT_GLOBAL_HINT_HEAD,
    `- 核心论点：${blueprint.thesis || "（未填写）"}`,
  ];
  if (blueprint.logicalFlow.trim()) {
    lines.push(`- 逻辑流：${blueprint.logicalFlow.trim().slice(0, 400)}`);
  }
  const top = blueprint.claims.slice(0, 6);
  if (top.length > 0) {
    lines.push("- 主要论断：");
    for (const c of top) {
      const loc = c.sectionPath ? `（${c.sectionPath}）` : "";
      lines.push(`  · ${c.claim}${loc}`);
    }
  }
  if (!blueprint.confirmedAt) {
    lines.push("- 注意：论证蓝图尚未确认，仅作参考");
  }
  return lines.join("\n");
}

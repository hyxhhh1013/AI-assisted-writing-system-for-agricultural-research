/** Phase 3 Argument Blueprint — 对齐 academic-paper argument_builder 产物 */

export interface ArgumentClaim {
  id: string;
  /** 核心论断 */
  claim: string;
  /** 证据要点（文献/数据简述） */
  evidence: string[];
  /** 映射到大纲章节路径 */
  sectionPath?: string;
  /** 反方/局限 */
  counterArgument?: string;
  /** 对反方的回应 */
  response?: string;
}

export interface ArgumentBlueprint {
  version: 1;
  /** 全文核心论点 */
  thesis: string;
  /** claim–evidence 链 */
  claims: ArgumentClaim[];
  /** 章节间逻辑流简述 */
  logicalFlow: string;
  /** 用户确认时间戳；有值才算 Phase 3 过关 */
  confirmedAt?: number;
  generatedAt: number;
  outlineHash?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isArgumentClaim(value: unknown): value is ArgumentClaim {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.claim !== "string") return false;
  if (!Array.isArray(value.evidence) || !value.evidence.every((e) => typeof e === "string")) {
    return false;
  }
  if (value.sectionPath !== undefined && typeof value.sectionPath !== "string") return false;
  if (value.counterArgument !== undefined && typeof value.counterArgument !== "string") return false;
  if (value.response !== undefined && typeof value.response !== "string") return false;
  return true;
}

export function isArgumentBlueprint(value: unknown): value is ArgumentBlueprint {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.thesis !== "string" || typeof value.logicalFlow !== "string") return false;
  if (typeof value.generatedAt !== "number") return false;
  if (!Array.isArray(value.claims) || !value.claims.every(isArgumentClaim)) return false;
  if (value.confirmedAt !== undefined && typeof value.confirmedAt !== "number") return false;
  if (value.outlineHash !== undefined && typeof value.outlineHash !== "string") return false;
  return true;
}

export function serializeArgumentBlueprint(blueprint: ArgumentBlueprint): string {
  return JSON.stringify(blueprint);
}

export function parseArgumentBlueprint(raw: string | null | undefined): ArgumentBlueprint | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isArgumentBlueprint(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isArgumentBlueprintConfirmed(
  blueprint: ArgumentBlueprint | null | undefined,
): boolean {
  return Boolean(blueprint?.confirmedAt && blueprint.claims.length > 0 && blueprint.thesis.trim());
}

export function createEmptyArgumentBlueprint(): ArgumentBlueprint {
  return {
    version: 1,
    thesis: "",
    claims: [],
    logicalFlow: "",
    generatedAt: Date.now(),
  };
}

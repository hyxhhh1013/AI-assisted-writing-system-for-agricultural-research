/**
 * 写工具人在环：仅服务端授予的确认可跳过中断；忽略模型自带的 userConfirmed。
 */

export interface GrantedConfirm {
  tool: string;
  /** 与 awaitingConfirm.params 对齐的可信参数（不含依赖 userConfirmed） */
  params: Record<string, unknown>;
}

/** 用于比对「是否同一条待确认操作」的稳定指纹 */
export function confirmIdentity(
  tool: string,
  params: Record<string, unknown>,
): string {
  const hitJson = params.hitJson != null ? String(params.hitJson) : "";
  const doi = String(params.doi ?? "").trim().toLowerCase();
  const index =
    params.index !== undefined && Number.isFinite(Number(params.index))
      ? String(Math.floor(Number(params.index)))
      : "";
  if (hitJson) {
    return `${tool}|hit:${hitJson}`;
  }
  if (doi) {
    return `${tool}|doi:${doi}|idx:${index}`;
  }
  // 无稳定键时退回全量（仍须服务端 grant 匹配）
  const copy = { ...params };
  delete copy.userConfirmed;
  return `${tool}|raw:${JSON.stringify(copy)}`;
}

export function isConfirmGranted(
  granted: GrantedConfirm | null | undefined,
  tool: string,
  params: Record<string, unknown>,
): boolean {
  if (!granted || granted.tool !== tool) return false;
  return confirmIdentity(tool, granted.params) === confirmIdentity(tool, params);
}

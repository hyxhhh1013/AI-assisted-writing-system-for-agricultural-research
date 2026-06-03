/** 应用内导航栈（纯函数，便于单测） */

export const NAV_STACK_MAX = 40;

export function pushNavPath(stack: string[], href: string): string[] {
  if (stack.length > 0 && stack[stack.length - 1] === href) {
    return stack;
  }
  const next = [...stack, href];
  return next.length > NAV_STACK_MAX ? next.slice(-NAV_STACK_MAX) : next;
}

/** 弹出当前页，返回上一页路径；栈不足时 target 为 null */
export function popNavBack(stack: string[]): { stack: string[]; target: string | null } {
  if (stack.length <= 1) {
    return { stack, target: null };
  }
  const next = stack.slice(0, -1);
  const target = next[next.length - 1] ?? null;
  return { stack: next, target };
}

export function buildAppHref(pathname: string, search = ""): string {
  return search ? `${pathname}${search.startsWith("?") ? search : `?${search}`}` : pathname;
}

/** 带 projectId 时回工作台，否则回项目列表 */
export function workbenchFallback(projectId: string | null | undefined): string {
  return projectId ? `/workbench?id=${encodeURIComponent(projectId)}` : "/projects";
}

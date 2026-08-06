"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AdminUrlPatch = Record<string, string | number | undefined | null>;

export function readAdminUrlParam(searchParams: URLSearchParams, key: string, fallback = ""): string {
  return searchParams.get(key) ?? fallback;
}

export function readAdminUrlPage(searchParams: URLSearchParams, fallback = 1): number {
  const raw = searchParams.get("page");
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function readAdminUrlSortOrder(
  searchParams: URLSearchParams,
  fallback: "asc" | "desc" = "desc",
): "asc" | "desc" {
  const raw = searchParams.get("sortOrder");
  return raw === "asc" || raw === "desc" ? raw : fallback;
}

export function buildAdminUrlQueryFromPatch(patch: AdminUrlPatch): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== null && value !== "") {
      next.set(key, String(value));
    }
  }
  return next.toString();
}

/** @deprecated 合并写入；列表页请用 buildAdminUrlQueryFromPatch */
export function buildAdminUrlQuery(current: URLSearchParams, patch: AdminUrlPatch): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  return next.toString();
}

interface UseAdminUrlWriterOptions {
  patch: AdminUrlPatch;
  enabled?: boolean;
}

/** 将列表状态写入 URL（replace，不滚动）；跳过首次渲染避免覆盖深链 */
export function useAdminUrlWriter({ patch, enabled = true }: UseAdminUrlWriterOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skipFirst = useRef(true);
  const patchKey = JSON.stringify(patch);

  useEffect(() => {
    if (!enabled) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }

    const parsed = JSON.parse(patchKey) as AdminUrlPatch;
    const qs = buildAdminUrlQueryFromPatch(parsed);
    const target = qs ? `${pathname}?${qs}` : pathname;
    const currentQs = searchParams.toString();
    const currentTarget = currentQs ? `${pathname}?${currentQs}` : pathname;
    if (target !== currentTarget) {
      router.replace(target, { scroll: false });
    }
  }, [enabled, patchKey, pathname, router, searchParams]);
}

/** 从 URL 初始化筛选项（客户端组件 mount 时调用一次） */
export function useAdminUrlInit(): URLSearchParams {
  return useSearchParams();
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  readAdminUrlPage,
  readAdminUrlParam,
  readAdminUrlSortOrder,
  useAdminUrlInit,
  useAdminUrlWriter,
} from "@/hooks/use-admin-url-sync";
import type { AdminListMeta, AdminListParams, AdminListResult } from "@/contracts/admin";

interface UseAdminListOptions<T> {
  fetcher: (params: AdminListParams) => Promise<AdminListResult<T>>;
  filters?: Omit<AdminListParams, "q" | "page" | "pageSize" | "sortBy" | "sortOrder">;
  pageSize?: number;
  debounceMs?: number;
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  /** 将 q/page/sort/筛选项同步到 URL，支持分享与深链 */
  urlSync?: boolean;
}

/** 查询签名变化且不在第 1 页时，应先翻页再请求 */
export function planAdminListFetch(args: {
  prevSignature: string;
  querySignature: string;
  page: number;
}): "reset-page" | "fetch" {
  if (args.prevSignature !== args.querySignature && args.page !== 1) {
    return "reset-page";
  }
  return "fetch";
}

export function buildAdminListQuerySignature(filterKey: string, debouncedQ: string): string {
  return `${filterKey}\0${debouncedQ}`;
}

function buildUrlPatch(args: {
  q: string;
  page: number;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  defaultSortBy?: string;
  defaultSortOrder: "asc" | "desc";
  parsedFilters: Record<string, unknown>;
}): Record<string, string | number | undefined> {
  const patch: Record<string, string | number | undefined> = {
    ...Object.fromEntries(
      Object.entries(args.parsedFilters).filter(
        ([, v]) => v !== undefined && v !== "",
      ),
    ) as Record<string, string>,
  };
  if (args.q) patch.q = args.q;
  if (args.page > 1) patch.page = args.page;
  if (args.sortBy && args.sortBy !== args.defaultSortBy) patch.sortBy = args.sortBy;
  if (args.sortBy && args.sortOrder !== args.defaultSortOrder) patch.sortOrder = args.sortOrder;
  return patch;
}

export function useAdminList<T>({
  fetcher,
  filters,
  pageSize = 20,
  debounceMs = 300,
  defaultSortBy,
  defaultSortOrder = "desc",
  urlSync = false,
}: UseAdminListOptions<T>) {
  const searchParams = useAdminUrlInit();

  const [q, setQ] = useState(() =>
    urlSync ? readAdminUrlParam(searchParams, "q") : "",
  );
  const [page, setPage] = useState(() =>
    urlSync ? readAdminUrlPage(searchParams) : 1,
  );
  const [sortBy, setSortBy] = useState<string | undefined>(() => {
    if (!urlSync) return defaultSortBy;
    return readAdminUrlParam(searchParams, "sortBy") || defaultSortBy;
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() =>
    urlSync ? readAdminUrlSortOrder(searchParams, defaultSortOrder) : defaultSortOrder,
  );
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<AdminListMeta>({ total: 0, page: 1, pageSize, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const debouncedQ = useDebouncedValue(q, debounceMs);
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const parsedFilters = useMemo(
    () => JSON.parse(filterKey) as Omit<AdminListParams, "q" | "page" | "pageSize" | "sortBy" | "sortOrder">,
    [filterKey],
  );
  const sortKey = `${sortBy ?? ""}\0${sortOrder}`;
  const querySignature = buildAdminListQuerySignature(`${filterKey}\0${sortKey}`, debouncedQ);

  const urlPatch = useMemo(
    () => buildUrlPatch({
      q,
      page,
      sortBy,
      sortOrder,
      defaultSortBy,
      defaultSortOrder,
      parsedFilters,
    }),
    [q, page, sortBy, sortOrder, defaultSortBy, defaultSortOrder, parsedFilters],
  );

  useAdminUrlWriter({ patch: urlPatch, enabled: urlSync });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const prevQuerySignature = useRef(querySignature);

  useEffect(() => {
    const plan = planAdminListFetch({
      prevSignature: prevQuerySignature.current,
      querySignature,
      page,
    });
    prevQuerySignature.current = querySignature;

    if (plan === "reset-page") {
      setPage(1);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetcherRef.current({
      ...parsedFilters,
      q: debouncedQ || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setMeta(result.meta);
      })
      .catch(() => {
        if (!cancelled) toast.error("加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parsedFilters, querySignature, page, pageSize, debouncedQ, sortBy, sortOrder]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current({
        ...parsedFilters,
        q: debouncedQ || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      setData(result.data);
      setMeta(result.meta);
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [parsedFilters, debouncedQ, page, pageSize, sortBy, sortOrder]);

  const setSearch = useCallback((value: string) => {
    setQ(value);
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortOrder("desc");
      return key;
    });
  }, []);

  return {
    q,
    setQ: setSearch,
    page,
    setPage,
    sortBy,
    sortOrder,
    toggleSort,
    data,
    meta,
    loading,
    reload,
  };
}

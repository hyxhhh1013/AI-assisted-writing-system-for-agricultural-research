"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewDetailResponse, ReviewHistoryItem } from "@/contracts/review";
import { getDetail, getHistory } from "@/services/review";

export interface UseReviewHistoryReturn {
  history: ReviewHistoryItem[];
  detail: ReviewDetailResponse | null;
  selectedId: string | null;
  isLoadingList: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectReview: (id: string) => Promise<void>;
  clearSelection: () => void;
}

export function useReviewHistory(projectId?: string | null): UseReviewHistoryReturn {
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [detail, setDetail] = useState<ReviewDetailResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);
    try {
      const items = await getHistory(projectId ?? undefined);
      setHistory(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载历史失败");
      setHistory([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectReview = useCallback(async (id: string) => {
    setSelectedId(id);
    setIsLoadingDetail(true);
    setError(null);
    try {
      const data = await getDetail(id);
      setDetail(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载详情失败");
      setDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  return {
    history,
    detail,
    selectedId,
    isLoadingList,
    isLoadingDetail,
    error,
    refresh,
    selectReview,
    clearSelection,
  };
}

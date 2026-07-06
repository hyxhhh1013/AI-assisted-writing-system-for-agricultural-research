"use client";

import { useState, useCallback, useRef } from "react";
import { startAnalysis } from "@/services/direction";
import type { AnalysisDimension, PaperCandidate, DirectionAnalysis, SynthesisResult } from "@/contracts/direction";

export interface AnalysisState {
  status: "idle" | "running" | "done" | "error";
  currentBatch: number;
  dimensions: Map<string, AnalysisDimension>;
  pendingDimensions: Set<string>;
  errors: Map<string, string>;
  candidates: PaperCandidate[];
  synthesis: SynthesisResult | null;
  result: DirectionAnalysis | null;
  errorMessage: string;
}

const initialState: AnalysisState = {
  status: "idle",
  currentBatch: 0,
  dimensions: new Map(),
  pendingDimensions: new Set(),
  errors: new Map(),
  candidates: [],
  synthesis: null,
  result: null,
  errorMessage: "",
};

export function useDirectionAnalysis() {
  const [state, setState] = useState<AnalysisState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  const run = useCallback(async (slug: string, mode: "full" | "quick" | "gap-only" = "full") => {
    // 重置
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const signal = abort.signal;

    setState((prev) => ({
      ...initialState,
      status: "running",
      dimensions: new Map(prev.dimensions), // 保留已锁定的维度
    }));

    try {
      const response = await startAnalysis(slug, mode);
      if (!response.body) throw new Error("无响应流");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr.trim()) continue;

          try {
            const event = JSON.parse(jsonStr);

            setState((prev) => {
              const next = { ...prev };
              next.dimensions = new Map(prev.dimensions);
              next.pendingDimensions = new Set(prev.pendingDimensions);
              next.errors = new Map(prev.errors);

              switch (event.type) {
                case "batch_start":
                  next.currentBatch = event.batch;
                  for (const dimId of event.dimensions) {
                    if (!next.dimensions.has(dimId)) {
                      next.pendingDimensions.add(dimId);
                    }
                  }
                  break;

                case "dimension_start":
                  next.pendingDimensions.add(event.dimensionId);
                  break;

                case "dimension_done":
                  next.pendingDimensions.delete(event.dimensionId);
                  next.dimensions.set(event.dimensionId, event.result);
                  break;

                case "dimension_error":
                  next.pendingDimensions.delete(event.dimensionId);
                  next.errors.set(event.dimensionId, event.error);
                  break;

                case "batch_done":
                  break;

                case "candidates":
                  next.candidates = event.candidates;
                  break;

                case "cross_direction":
                  if (next.result) {
                    next.result = {
                      ...next.result,
                      crossDirectionOpportunities: event.opportunities,
                    };
                  }
                  break;

                case "synthesis":
                  next.synthesis = event.synthesis;
                  break;

                case "done":
                  next.status = "done";
                  next.result = event.analysis;
                  break;

                case "error":
                  next.status = "error";
                  next.errorMessage = event.message;
                  break;
              }

              return next;
            });
          } catch {
            // 跳过无法解析的行
          }
        }
      }

      // 如果流结束但未收到 done 事件，标记完成
      setState((prev) => {
        if (prev.status !== "error") {
          return { ...prev, status: "done" };
        }
        return prev;
      });
    } catch (err) {
      if (signal.aborted) return;
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "分析过程出错",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, status: "idle" }));
  }, []);

  /** 锁定/编辑单个维度 */
  const updateDimension = useCallback((dimensionId: string, updates: Partial<AnalysisDimension>) => {
    setState((prev) => {
      const existing = prev.dimensions.get(dimensionId);
      if (!existing) return prev;
      const next = { ...prev };
      next.dimensions = new Map(prev.dimensions);
      next.dimensions.set(dimensionId, { ...existing, ...updates });
      return next;
    });
  }, []);

  return { state, run, cancel, reset, updateDimension };
}

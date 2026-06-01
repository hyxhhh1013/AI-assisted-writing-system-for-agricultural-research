"use client";

import { useState, useCallback, useRef } from "react";
import { checkPlagiarismStream } from "@/services/plagiarism";
import type {
  PlagiarismCheckRequest,
  PlagiarismCheckResult,
} from "@/contracts/plagiarism";

// ==================== 类型 ====================

export interface PlagiarismStage {
  stage: string;
  label: string;
}

export interface UsePlagiarismCheckReturn {
  /** 查重结果 */
  result: PlagiarismCheckResult | null;
  /** 是否正在查重 */
  checking: boolean;
  /** 当前阶段信息 */
  stage: PlagiarismStage | null;
  /** 错误信息 */
  error: string | null;
  /** 执行查重 */
  check: (payload: PlagiarismCheckRequest) => Promise<void>;
  /** 取消查重 */
  cancel: () => void;
  /** 重置状态 */
  reset: () => void;
}

// ==================== Hook ====================

export function usePlagiarismCheck(): UsePlagiarismCheckReturn {
  const [result, setResult] = useState<PlagiarismCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [stage, setStage] = useState<PlagiarismStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setChecking(false);
    setStage({ stage: "error", label: "已取消" });
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setChecking(false);
    setStage(null);
    setError(null);
    abortRef.current = null;
  }, []);

  const check = useCallback(async (payload: PlagiarismCheckRequest) => {
    setChecking(true);
    setResult(null);
    setError(null);
    setStage({ stage: "splitting", label: "正在准备..." });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalResult = await checkPlagiarismStream(
        payload,
        (event) => {
          if (event.type === "progress") {
            setStage({ stage: event.stage, label: event.message });
          } else if (event.type === "done") {
            setStage({ stage: "done", label: "查重完成" });
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
        controller.signal,
      );

      setResult(finalResult);
      setStage({ stage: "done", label: "查重完成" });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setStage({ stage: "error", label: "已取消" });
        return;
      }
      const message = err instanceof Error ? err.message : "查重失败";
      setError(message);
      setStage({ stage: "error", label: message });
    } finally {
      setChecking(false);
      abortRef.current = null;
    }
  }, []);

  return {
    result,
    checking,
    stage,
    error,
    check,
    cancel,
    reset,
  };
}

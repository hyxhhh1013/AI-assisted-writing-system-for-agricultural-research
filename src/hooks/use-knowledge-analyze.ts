"use client";

import { useCallback, useRef, useState } from "react";
import type { KnowledgeAnalyzeMeta, KnowledgeAnalyzeRequest } from "@/contracts/knowledge-analyze";
import { analyzeKnowledgeStream } from "@/services/knowledge";

export interface UseKnowledgeAnalyzeResult {
  text: string;
  meta: KnowledgeAnalyzeMeta | null;
  isAnalyzing: boolean;
  error: string | null;
  analyze: (params: KnowledgeAnalyzeRequest) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useKnowledgeAnalyze(): UseKnowledgeAnalyzeResult {
  const abortRef = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<KnowledgeAnalyzeMeta | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setText("");
    setMeta(null);
    setError(null);
    setIsAnalyzing(false);
  }, [cancel]);

  const analyze = useCallback(async (params: KnowledgeAnalyzeRequest) => {
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setError(null);
    setText("");
    setMeta(null);

    try {
      await analyzeKnowledgeStream(
        params,
        (progress) => {
          setMeta(progress.meta);
          setText(progress.text);
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "文献分析失败";
      setError(message);
      throw err;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsAnalyzing(false);
    }
  }, [cancel]);

  return { text, meta, isAnalyzing, error, analyze, cancel, reset };
}

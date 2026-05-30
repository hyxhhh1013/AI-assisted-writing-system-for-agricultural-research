"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { WritingRequest } from "@/contracts/writing";
import {
  isDeltaEvent, isStatusEvent, isPipelineStepEvent, isVerificationEvent,
  isReferencesEvent, isCitationWarningsEvent, isDataClaimWarningsEvent,
  isCorrectedTextEvent, isClearResultEvent, isErrorEvent, isInfoEvent,
  type SSEEvent,
} from "@/contracts/sse";

export interface PipelineStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface WritingStreamResult {
  content: string;
  verification: string;
  references: string[];
  refMapping?: Record<string, number>;
  citationWarnings: { num: number; overlap: number; context: string }[];
  dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[];
  pipelineSteps: PipelineStep[];
}

export interface UseWritingStreamReturn {
  isGenerating: boolean;
  generationStatus: "idle" | "retrieving" | "building_context" | "writing" | "verifying" | "refining" | "checking_citations" | "generating_figures" | "completed";
  result: string;
  verificationFeedback: string;
  detectedRefs: string[];
  citationWarnings: { num: number; overlap: number; context: string }[];
  dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[];
  pipelineSteps: PipelineStep[];
  start: (request: WritingRequest) => Promise<WritingStreamResult>;
  cancel: () => void;
  reset: () => void;
}

export function useWritingStream(): UseWritingStreamReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "retrieving" | "building_context" | "writing" | "verifying" | "refining" | "checking_citations" | "generating_figures" | "completed">("idle");
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [citationWarnings, setCitationWarnings] = useState<{ num: number; overlap: number; context: string }[]>([]);
  const [dataClaimWarnings, setDataClaimWarnings] = useState<{ claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef("");
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verificationRef = useRef("");
  const refsRef = useRef<string[]>([]);
  const refMappingRef = useRef<Record<string, number>>({});
  const warningsRef = useRef<{ num: number; overlap: number; context: string }[]>([]);
  const dcWarningsRef = useRef<{ claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[]>([]);
  const stepsRef = useRef<PipelineStep[]>([]);

  const reset = useCallback(() => {
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }
    setResult("");
    setVerificationFeedback("");
    setDetectedRefs([]);
    setCitationWarnings([]);
    setDataClaimWarnings([]);
    setPipelineSteps([]);
    setGenerationStatus("idle");
    resultRef.current = "";
    verificationRef.current = "";
    refsRef.current = [];
    refMappingRef.current = {};
    warningsRef.current = [];
    dcWarningsRef.current = [];
    stepsRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setGenerationStatus("idle");
    toast.info("已取消扩写");
  }, []);

  const start = useCallback(async (request: WritingRequest): Promise<WritingStreamResult> => {
    if (abortRef.current) abortRef.current.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsGenerating(true);
    setGenerationStatus("writing");
    reset();

    // 初始化管道步骤（从 pending 开始，由 SSE pipeline_step 事件逐步更新）
    const defaultSteps: PipelineStep[] = [
      { key: "retrieving", label: "检索文献", status: "pending" },
      { key: "building_context", label: "证据整理", status: "pending" },
      { key: "writing", label: "AI 写作", status: "pending" },
      { key: "verifying", label: "审稿核查", status: "pending" },
      { key: "refining", label: "主编修正", status: "pending" },
      { key: "checking_citations", label: "引用校验", status: "pending" },
      { key: "checking_data", label: "数据核查", status: "pending" },
    ];
    stepsRef.current = defaultSteps;
    setPipelineSteps(defaultSteps);

    try {
      const response = await fetch("/api/writing", {
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) throw new Error("写作请求失败");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let hasPipelineUpdate = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data:")) continue;

          try {
            const event = JSON.parse(trimmed.slice(5).trim()) as SSEEvent;

            if (isStatusEvent(event)) {
              setGenerationStatus(event.status);
              if (event.status === "writing") toast.info("AI 正在起草内容...");
              else if (event.status === "verifying") toast.info("学术核查代理审计中...");
              else if (event.status === "refining") toast.info("主编根据审稿意见修正中...");
            } else if (isDeltaEvent(event)) {
              resultRef.current = resultRef.current + event.content;
              // 节流：最多每 150ms 触发一次 React 重渲染，避免逐字卡顿
              if (!renderTimerRef.current) {
                renderTimerRef.current = setTimeout(() => {
                  renderTimerRef.current = null;
                  setResult(resultRef.current);
                }, 150);
              }
            } else if (isVerificationEvent(event)) {
              verificationRef.current += event.verification;
              setVerificationFeedback(verificationRef.current);
            } else if (isCorrectedTextEvent(event)) {
              resultRef.current = event.text;
              setResult(event.text);
            } else if (isClearResultEvent(event)) {
              resultRef.current = "";
              setResult("");
            } else if (isReferencesEvent(event)) {
              if (event.references.length > 0) {
                refsRef.current = Array.from(new Set([...refsRef.current, ...event.references]));
                setDetectedRefs(refsRef.current);
              }
              if (event.refMapping) {
                refMappingRef.current = { ...refMappingRef.current, ...event.refMapping };
              }
            } else if (isCitationWarningsEvent(event)) {
              warningsRef.current = event.warnings;
              setCitationWarnings(event.warnings);
            } else if (isDataClaimWarningsEvent(event)) {
              dcWarningsRef.current = event.warnings;
              setDataClaimWarnings(event.warnings);
            } else if (isPipelineStepEvent(event)) {
              stepsRef.current = stepsRef.current.map(s =>
                s.key === event.step ? { ...s, status: event.status, detail: event.detail || s.detail } : s
              );
              setPipelineSteps([...stepsRef.current]);
              hasPipelineUpdate = true;
            } else if (isErrorEvent(event)) {
              toast.error(event.error);
            } else if (isInfoEvent(event)) {
              if (event.refMapping) {
                refMappingRef.current = { ...refMappingRef.current, ...event.refMapping };
              } else {
                toast.info(event.info);
              }
            }
          } catch { /* skip malformed */ }
        }
        // 每批事件处理完后 yield，确保 pipeline 步骤逐帧渲染
        if (hasPipelineUpdate) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // user cancelled
      } else {
        const raw = error instanceof Error ? error.message : "写作生成失败";
        // 超长消息（如 HTML 504 页面）截断并显示友好提示
        const msg = raw.length > 80 ? "AI 服务暂时不可用，请稍后重试" : raw;
        toast.error(msg);
      }
    } finally {
      // 清除节流定时器，立刻将最终内容刷入 state
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
        renderTimerRef.current = null;
      }
      setResult(resultRef.current);
      abortRef.current = null;
      setIsGenerating(false);
      setGenerationStatus("completed");
    }

    return {
      content: resultRef.current,
      verification: verificationRef.current,
      references: refsRef.current,
      refMapping: refMappingRef.current,
      citationWarnings: warningsRef.current,
      dataClaimWarnings: dcWarningsRef.current,
      pipelineSteps: stepsRef.current,
    };
  }, [reset]);

  return { isGenerating, generationStatus, result, verificationFeedback, detectedRefs, citationWarnings, dataClaimWarnings, pipelineSteps, start, cancel, reset };
}

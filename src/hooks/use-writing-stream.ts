"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { WritingRequest } from "@/contracts/writing";
import { postWritingStream } from "@/services/writing";
import { getErrorMessage } from "@/lib/error-utils";
import {
  isDeltaEvent, isStatusEvent, isPipelineStepEvent, isVerificationEvent,
  isReviewReportEvent,
  isReferencesEvent, isCitationWarningsEvent, isDataClaimWarningsEvent,
  isCorrectedTextEvent, isClearResultEvent, isErrorEvent, isInfoEvent, isBulletDoneEvent,
  type SSEEvent,
} from "@/contracts/sse";
import { formatVerificationIssuesForRefiner } from "@/contracts/writing-verification";

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
  bulletDone?: { bulletIndex: number; content: string; bulletCount: number };
}

export interface WritingStreamStartOptions {
  /** 流式开始前保留 resultRef 已有内容 */
  keepDraft?: boolean;
  /** 单条要点扩写：delta 从空串累积，不拼接 keepDraft */
  replaceStream?: boolean;
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
  start: (request: WritingRequest, options?: WritingStreamStartOptions) => Promise<WritingStreamResult>;
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
  const bulletDoneRef = useRef<WritingStreamResult["bulletDone"]>(undefined);

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
    bulletDoneRef.current = undefined;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setGenerationStatus("idle");
    toast.info("已取消扩写");
  }, []);

  const start = useCallback(async (
    request: WritingRequest,
    options?: WritingStreamStartOptions,
  ): Promise<WritingStreamResult> => {
    if (abortRef.current) abortRef.current.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const draftToKeep = options?.keepDraft ? resultRef.current : "";
    const replaceStream = options?.replaceStream === true;

    setIsGenerating(true);
    setGenerationStatus("writing");
    reset();

    if (options?.keepDraft && draftToKeep && !replaceStream) {
      resultRef.current = draftToKeep;
      setResult(draftToKeep);
    }

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
      const response = await postWritingStream(request, abortController.signal);

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
            } else if (isReviewReportEvent(event)) {
              const readable = event.report.passed
                ? event.report.summary
                : formatVerificationIssuesForRefiner(event.report);
              verificationRef.current = readable;
              setVerificationFeedback(readable);
            } else if (isCorrectedTextEvent(event)) {
              resultRef.current = event.text;
              setResult(event.text);
            } else if (isClearResultEvent(event)) {
              resultRef.current = "";
              setResult("");
            } else if (isReferencesEvent(event)) {
              if (event.references.length > 0) {
                refsRef.current = event.references;
                setDetectedRefs(event.references);
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
              const partial = resultRef.current.trim().length > 0;
              toast.error(
                partial
                  ? `${event.error}（已保留已生成内容，可编辑后重试）`
                  : event.error,
              );
            } else if (isInfoEvent(event)) {
              if (event.refMapping) {
                refMappingRef.current = { ...refMappingRef.current, ...event.refMapping };
              } else {
                toast.info(event.info);
              }
            } else if (isBulletDoneEvent(event)) {
              bulletDoneRef.current = {
                bulletIndex: event.bulletIndex,
                content: event.content,
                bulletCount: event.bulletCount,
              };
              resultRef.current = event.content;
              setResult(event.content);
            }
          } catch { /* skip malformed */ }
        }
        // 每批事件处理完后 yield，确保 pipeline 步骤逐帧渲染
        if (hasPipelineUpdate) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    } catch (error: unknown) {
      const partial = resultRef.current.trim().length > 0;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (partial) {
          toast.info("已取消扩写，已生成内容已保留");
        }
      } else {
        const raw = error instanceof Error ? getErrorMessage(error) : "写作生成失败";
        const lower = raw.toLowerCase();
        const isBusy =
          lower.includes("系统繁忙") || lower.includes("writing_concurrency");
        const isNetworkDrop =
          lower.includes("network") ||
          lower.includes("failed to fetch") ||
          lower.includes("load failed") ||
          lower.includes("networkerror");
        let msg: string;
        if (isBusy) {
          msg = raw;
        } else if (isNetworkDrop) {
          msg = partial
            ? "连接中断，已保留已生成内容；可编辑后重试，或改用「快速预览」"
            : "连接中断（可能因等待过久或网络波动），请重试；长章节可改用「快速预览」";
        } else {
          msg =
            raw.length > 80
              ? partial
                ? "AI 服务暂时不可用，已保留已生成内容，请稍后重试"
                : "AI 服务暂时不可用，请稍后重试"
              : partial
                ? `${raw}（已保留已生成内容）`
                : raw;
        }
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
      bulletDone: bulletDoneRef.current,
    };
  }, [reset]);

  return { isGenerating, generationStatus, result, verificationFeedback, detectedRefs, citationWarnings, dataClaimWarnings, pipelineSteps, start, cancel, reset };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AgentCheckpointDecision,
  AgentCheckpointRequest,
  AgentConfirmRequest,
  AgentPlan,
  AgentSSEEvent,
  AgentStatus,
  AgentSummary,
} from "@/contracts/agent";
import type { AgentSessionListItem, AgentUiMessage } from "@/contracts/agent-session";
import { extractChartPersisted, type AgentChartPersistedInfo } from "@/lib/agent/chart-persisted";
import {
  extractProjectMutated,
  type AgentProjectMutatedInfo,
} from "@/lib/agent/project-mutated";
import { extractSectionPersisted, type AgentSectionPersistedInfo } from "@/lib/agent/section-persisted";
import { mergeSessionTranscripts } from "@/lib/agent/ui-transcript";
import {
  initWriteStatus,
  mergeProgressIntoWriteStatus,
  finalizeWriteStatus,
  type WriteStatus,
} from "@/lib/agent/write-status";
import {
  listAgentSessions,
  loadAgentChatHistory,
  postAgentStream,
  postInterruptAgentSession,
} from "@/services/agent";
import { getErrorMessage } from "@/lib/error-utils";
import {
  isAgentSessionBusyError,
  resolveAgentIsRunning,
  shouldShowOrphanedSession,
} from "@/lib/agent/ui-progress";

export type AgentMessage = AgentUiMessage;

export interface UseAgentOptions {
  projectId?: string;
  directionSlug?: string;
  onSectionPersisted?: (info: AgentSectionPersistedInfo) => void;
  onChartPersisted?: (info: AgentChartPersistedInfo) => void;
  /** 任意写回项目后刷新工作台（配置/大纲/蓝图/文献等） */
  onProjectMutated?: (info: AgentProjectMutatedInfo) => void;
}

export function useAgent(options: UseAgentOptions = {}) {
  const [status, setStatus] = useState<AgentStatus | "idle">("idle");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AgentConfirmRequest | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<AgentCheckpointRequest | null>(null);
  const [lastPersisted, setLastPersisted] = useState<AgentSectionPersistedInfo | null>(null);
  const [lastProjectMutation, setLastProjectMutation] = useState<AgentProjectMutatedInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [interruptedSessions, setInterruptedSessions] = useState<AgentSessionListItem[]>([]);
  /** 服务器仍 running、本端 SSE 已断：界面空白时用来接上/强制结束 */
  const [orphanedRunning, setOrphanedRunning] = useState<AgentSessionListItem | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  /** 真流式：agent 回复正在逐 token 到达的增量文本 */
  const [streamingText, setStreamingText] = useState("");
  /** 常驻写状态卡：write_section 执行期间的阶段/字数/耗时/提示 */
  const [writeStatus, setWriteStatus] = useState<WriteStatus | null>(null);
  /** import_reference 批量导入进度（agent/progress stage=importing） */
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
    title: string;
    label: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** SSE 请求仍在飞：不能只靠 status，思考/导入可能几十秒没有新事件 */
  const [inFlight, setInFlight] = useState(false);
  const onPersistedRef = useRef(options.onSectionPersisted);
  const onChartPersistedRef = useRef(options.onChartPersisted);
  const onProjectMutatedRef = useRef(options.onProjectMutated);
  const projectIdRef = useRef(options.projectId);
  useEffect(() => {
    onPersistedRef.current = options.onSectionPersisted;
  }, [options.onSectionPersisted]);
  useEffect(() => {
    onChartPersistedRef.current = options.onChartPersisted;
  }, [options.onChartPersisted]);
  useEffect(() => {
    onProjectMutatedRef.current = options.onProjectMutated;
  }, [options.onProjectMutated]);
  useEffect(() => {
    projectIdRef.current = options.projectId;
  }, [options.projectId]);

  const refreshInterrupted = useCallback(async () => {
    if (!options.projectId) {
      setInterruptedSessions([]);
      setOrphanedRunning(null);
      return;
    }
    try {
      const [interrupted, running] = await Promise.all([
        listAgentSessions({
          projectId: options.projectId,
          status: "interrupted",
        }),
        listAgentSessions({
          projectId: options.projectId,
          status: "running",
        }),
      ]);
      setInterruptedSessions(interrupted);
      setOrphanedRunning(running[0] ?? null);
    } catch {
      setInterruptedSessions([]);
      setOrphanedRunning(null);
    }
  }, [options.projectId]);

  /** 打开项目时恢复历史气泡 */
  const loadHistory = useCallback(async (projectId: string) => {
    try {
      const sessions = await loadAgentChatHistory(projectId);
      if (projectIdRef.current !== projectId) return;
      const transcript = mergeSessionTranscripts(
        sessions.map((s) => ({
          goal: s.goal,
          uiTranscript: s.uiTranscript,
        })),
      );
      setMessages(transcript);
      const last = sessions[sessions.length - 1];
      // 续聊挂到最近一条会话（含 completed），实现真多轮
      if (last) {
        setSessionId(last.id);
        if (last.awaitingCheckpoint) {
          setPendingCheckpoint(last.awaitingCheckpoint);
          setStatus("awaiting_checkpoint");
        }
        if (last.awaitingConfirm) {
          setPendingConfirm(last.awaitingConfirm);
          setStatus("awaiting_checkpoint");
        }
      }
      setHistoryLoaded(true);
    } catch {
      if (projectIdRef.current === projectId) {
        setMessages([]);
        setHistoryLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    void refreshInterrupted();
  }, [refreshInterrupted]);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setInFlight(false);
    setWriteStatus(null);
    setImportProgress(null);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
    setPendingCheckpoint(null);
    setLastPersisted(null);
    setSessionId(null);
    setHistoryLoaded(false);

    if (!options.projectId) {
      setMessages([]);
      return;
    }
    void loadHistory(options.projectId);
  }, [options.projectId, loadHistory]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setInFlight(false);
    setMessages([]);
    setStreamingText("");
    setWriteStatus(null);
    setImportProgress(null);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
    setPendingCheckpoint(null);
    setLastPersisted(null);
    setSessionId(null);
  }, []);

  /** 新开对话：保留历史气泡，仅断开 sessionId，下一条消息会创建新会话 */
  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setInFlight(false);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
    setPendingCheckpoint(null);
    setLastPersisted(null);
    setWriteStatus(null);
    setImportProgress(null);
    setSessionId(null);
    setHistoryLoaded(true);
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last?.kind === "divider") return prev;
      return [...prev, { kind: "divider", label: "新对话" }];
    });
    toast.message("已开新对话，上方历史仍可查看");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingText("");
    setWriteStatus(null);
    setImportProgress(null);
    setInFlight(false);
    setStatus("cancelled");
    void refreshInterrupted();
  }, [refreshInterrupted]);

  const abandonOrphanedSession = useCallback(async () => {
    const id = orphanedRunning?.id ?? sessionId;
    if (!id) return;
    try {
      await postInterruptAgentSession(id);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
    setOrphanedRunning(null);
    void refreshInterrupted();
  }, [orphanedRunning?.id, sessionId, refreshInterrupted]);

  const handleEvent = useCallback((event: AgentSSEEvent) => {
    switch (event.type) {
      case "agent/status":
        setStatus(event.status);
        break;
      case "agent/session":
        setSessionId(event.sessionId);
        if (event.status === "interrupted") {
          void refreshInterrupted();
        }
        if (event.resumed && event.toolSummaries?.length) {
          setMessages((prev) => [
            ...prev,
            {
              kind: "thought",
              text: `从断点继续（已完成 ${event.toolSummaries!.length} 步工具）`,
            },
          ]);
        }
        break;
      case "agent/plan":
        setPlan(event.plan);
        break;
      case "agent/thought_delta":
        if (event.content) {
          setStreamingText((prev) => prev + event.content);
        }
        break;
      case "agent/thought":
        if (event.content?.trim()) {
          setMessages((prev) => [...prev, { kind: "thought", text: event.content! }]);
        }
        setStreamingText("");
        break;
      case "agent/action":
        if (event.tool === "write_section") {
          const section = String(event.params?.section ?? "章节");
          setWriteStatus(initWriteStatus(section));
        }
        setMessages((prev) => [
          ...prev,
          { kind: "action", tool: event.tool, params: event.params },
        ]);
        break;
      case "agent/progress":
        if (event.stage === "importing") {
          setImportProgress({
            done: event.done ?? 0,
            total: event.total ?? 0,
            title: event.detail ?? "",
            label: event.label,
          });
          break;
        }
        setWriteStatus((prev) => (prev ? mergeProgressIntoWriteStatus(prev, event) : prev));
        break;
      case "agent/observation": {
        const data = event.result?.data;
        const dataObj =
          data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const imageUrl =
          dataObj && typeof dataObj.imageUrl === "string"
            ? dataObj.imageUrl
            : undefined;
        const rawPlotHref =
          dataObj && typeof dataObj.href === "string" && dataObj.href.startsWith("/plot")
            ? dataObj.href
            : undefined;
        const replaceImageUrl = imageUrl;
        // 兜底：旧 observation 的 href 可能未带 replaceImageUrl
        let plotHref = rawPlotHref;
        if (rawPlotHref && imageUrl && !rawPlotHref.includes("replaceImageUrl=")) {
          const sep = rawPlotHref.includes("?") ? "&" : "?";
          plotHref = `${rawPlotHref}${sep}replaceImageUrl=${encodeURIComponent(imageUrl)}`;
        }
        const sectionKey =
          dataObj && typeof dataObj.insertedSection === "string"
            ? dataObj.insertedSection
            : dataObj?.persisted
              && typeof dataObj.persisted === "object"
              && typeof (dataObj.persisted as { sectionKey?: unknown }).sectionKey === "string"
              ? String((dataObj.persisted as { sectionKey: string }).sectionKey)
              : undefined;
        const insertMode =
          dataObj && typeof dataObj.insertMode === "string"
            ? dataObj.insertMode
            : undefined;
        const keepData =
          data != null
          && (event.tool === "validate_citations"
            || event.tool === "draft_mechanism_figure"
            || event.tool === "generate_chart"
            || event.tool === "generate_xrd_analysis");
        setMessages((prev) => [
          ...prev,
          {
            kind: "observation",
            tool: event.tool,
            summary: event.result?.summary,
            error: event.error ?? event.result?.error,
            ...(imageUrl ? { imageUrl } : {}),
            ...(plotHref ? { plotHref } : {}),
            ...(replaceImageUrl ? { replaceImageUrl } : {}),
            ...(sectionKey ? { sectionKey } : {}),
            ...(insertMode ? { insertMode } : {}),
            ...(keepData ? { data } : {}),
          },
        ]);
        if (event.tool === "import_reference") setImportProgress(null);
        if (event.tool === "write_section") {
          setWriteStatus((prev) => {
            if (!prev) return prev;
            const data = event.result?.data as
              | { charCount?: number; issueCount?: number; pipelineMode?: string; verification?: string }
              | undefined;
            return finalizeWriteStatus(prev, {
              success: Boolean(event.result?.success) && !event.error,
              charCount: data?.charCount,
              issueCount: data?.issueCount,
              pipelineMode: data?.pipelineMode,
              verification: data?.verification,
              error: event.error ?? event.result?.error,
            });
          });
        }
        const persisted = extractSectionPersisted(event.tool, event.result);
        if (persisted) {
          setLastPersisted(persisted);
          onPersistedRef.current?.(persisted);
        }
        const chart = extractChartPersisted(event.tool, event.result);
        if (chart) {
          onChartPersistedRef.current?.(chart);
        }
        const mutated = extractProjectMutated(event.tool, event.result);
        if (mutated) {
          setLastProjectMutation(mutated);
          onProjectMutatedRef.current?.(mutated);
        }
        break;
      }
      case "agent/confirm":
        setPendingConfirm({
          tool: event.tool,
          params: event.params,
          message: event.message,
          ...(event.preview ? { preview: event.preview } : {}),
        });
        setStatus("awaiting_checkpoint");
        break;
      case "agent/checkpoint":
        setPendingCheckpoint(event.checkpoint);
        setStatus("awaiting_checkpoint");
        setMessages((prev) => [
          ...prev,
          { kind: "thought", text: `${event.checkpoint.title}：${event.checkpoint.message}` },
        ]);
        break;
      case "agent/complete":
        setStreamingText("");
        setWriteStatus(null);
        setImportProgress(null);
        setSummary(event.summary);
        setMessages((prev) => [...prev, { kind: "summary", summary: event.summary }]);
        setPendingCheckpoint(null);
        setPendingConfirm(null);
        setStatus("completed");
        void refreshInterrupted();
        break;
      case "agent/error":
        setStreamingText("");
        setWriteStatus(null);
        setImportProgress(null);
        setPendingCheckpoint(null);
        setPendingConfirm(null);
        toast.error(event.error);
        setStatus("error");
        void refreshInterrupted();
        break;
      default:
        break;
    }
  }, [refreshInterrupted]);

  const runStream = useCallback(
    async (
      request: Parameters<typeof postAgentStream>[0],
      userLine?: string,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setInFlight(true);

      if (userLine) {
        setMessages((prev) => [...prev, { kind: "user", text: userLine }]);
      }
      setPlan(null);
      setSummary(null);
      setLastPersisted(null);
      setPendingConfirm(null);
      setPendingCheckpoint(null);
      setWriteStatus(null);
      setImportProgress(null);
      setStatus("planning");

      try {
        let sawTerminal = false;
        await postAgentStream(request, {
          signal: controller.signal,
          onEvent: (event) => {
            if (
              event.type === "agent/complete"
              || event.type === "agent/error"
              || (event.type === "agent/status"
                && (event.status === "awaiting_checkpoint"
                  || event.status === "completed"
                  || event.status === "error"
                  || event.status === "cancelled"))
            ) {
              sawTerminal = true;
            }
            handleEvent(event);
          },
        });
        setStatus((prev) => {
          const mid =
            prev === "planning"
            || prev === "thinking"
            || prev === "executing"
            || prev === "finalizing";
          if (!sawTerminal && mid) {
            toast.message("连接中断，写节可能还没落地。直接说「继续」接着写。");
            return "cancelled";
          }
          return mid ? "completed" : prev;
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          setStatus((prev) =>
            prev === "cancelled" || prev === "awaiting_checkpoint" ? prev : "cancelled",
          );
          void refreshInterrupted();
          return;
        }
        const message = getErrorMessage(error);
        if (isAgentSessionBusyError(message)) {
          if (userLine) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.kind === "user" && last.text === userLine) {
                return prev.slice(0, -1);
              }
              return prev;
            });
          }
          setStatus((prev) => (prev === "planning" ? "completed" : prev));
          toast.error("上一轮还在服务器上跑，这边已经断开，看不到进度。请接上或强制结束。");
          void refreshInterrupted();
          return;
        }
        toast.error(message);
        setWriteStatus(null);
        setImportProgress(null);
        setStatus("error");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setInFlight(false);
        void refreshInterrupted();
      }
    },
    [handleEvent, refreshInterrupted],
  );

  const sendGoal = useCallback(
    async (goal: string, opts?: { attachmentIds?: string[] }) => {
      const trimmed = goal.trim();
      if (!trimmed && !opts?.attachmentIds?.length) return;
      await runStream(
        {
          goal: trimmed,
          projectId: options.projectId,
          directionSlug: options.directionSlug,
          mode: "auto",
          ...(sessionId ? { sessionId } : {}),
          ...(opts?.attachmentIds?.length ? { attachmentIds: opts.attachmentIds } : {}),
        },
        trimmed,
      );
    },
    [runStream, options.projectId, options.directionSlug, sessionId],
  );

  const resumeSession = useCallback(
    async (id: string) => {
      await runStream(
        {
          sessionId: id,
          resume: true,
          projectId: options.projectId,
          mode: "auto",
        },
        "继续上次中断的任务",
      );
    },
    [runStream, options.projectId],
  );

  const resolveCheckpoint = useCallback(
    async (decision: AgentCheckpointDecision["decision"], note?: string) => {
      if (!sessionId || !pendingCheckpoint) {
        toast.error("没有待处理的检查点");
        return;
      }
      const label =
        decision === "approve"
          ? `批准：${pendingCheckpoint.title}`
          : `需修改：${pendingCheckpoint.title}`;
      await runStream(
        {
          sessionId,
          resume: true,
          projectId: options.projectId,
          mode: "auto",
          checkpointDecision: {
            checkpointId: pendingCheckpoint.id,
            decision,
            note,
          },
        },
        label,
      );
    },
    [runStream, sessionId, pendingCheckpoint, options.projectId],
  );

  const resolveConfirm = useCallback(
    async (approved: boolean, selectedIndices?: number[]) => {
      if (!sessionId || !pendingConfirm) {
        toast.error("没有待确认的操作");
        return;
      }
      if (!approved) {
        setPendingConfirm(null);
        toast.message("已取消该操作");
        return;
      }
      await runStream(
        {
          sessionId,
          resume: true,
          projectId: options.projectId,
          mode: "auto",
          confirmDecision: {
            tool: pendingConfirm.tool,
            params: pendingConfirm.params,
            approved: true,
            ...(selectedIndices && selectedIndices.length > 0
              ? { selectedIndices }
              : {}),
          },
        },
        `确认执行：${pendingConfirm.tool}`,
      );
    },
    [runStream, sessionId, pendingConfirm, options.projectId],
  );

  const isRunning = resolveAgentIsRunning({
    inFlight,
    status,
    hasPendingConfirm: Boolean(pendingConfirm),
    hasPendingCheckpoint: Boolean(pendingCheckpoint),
  });

  return {
    status,
    messages,
    streamingText,
    writeStatus,
    importProgress,
    plan,
    summary,
    pendingConfirm,
    pendingCheckpoint,
    lastPersisted,
    lastProjectMutation,
    sessionId,
    interruptedSessions,
    orphanedRunning: shouldShowOrphanedSession({
      inFlight,
      status,
      hasPendingConfirm: Boolean(pendingConfirm),
      hasPendingCheckpoint: Boolean(pendingCheckpoint),
    })
      ? orphanedRunning
      : null,
    abandonOrphanedSession,
    historyLoaded,
    sendGoal,
    resumeSession,
    resolveCheckpoint,
    resolveConfirm,
    refreshInterrupted,
    cancel,
    reset,
    startNewChat,
    isRunning,
  };
}

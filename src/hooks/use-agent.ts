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
import { listAgentSessions, loadAgentChatHistory, postAgentStream } from "@/services/agent";
import { getErrorMessage } from "@/lib/error-utils";

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
  const [historyLoaded, setHistoryLoaded] = useState(false);
  /** 真流式：agent 回复正在逐 token 到达的增量文本 */
  const [streamingText, setStreamingText] = useState("");
  /** 长工具（write_section）执行期间的实时进度文案 */
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
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
      return;
    }
    try {
      const list = await listAgentSessions({
        projectId: options.projectId,
        status: "interrupted",
      });
      setInterruptedSessions(list);
    } catch {
      setInterruptedSessions([]);
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
    setProgressLabel(null);
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
    setMessages([]);
    setStreamingText("");
    setProgressLabel(null);
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
    setProgressLabel(null);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
    setPendingCheckpoint(null);
    setLastPersisted(null);
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
    setProgressLabel(null);
    setStatus("cancelled");
    void refreshInterrupted();
  }, [refreshInterrupted]);

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
        setProgressLabel(null);
        setMessages((prev) => [
          ...prev,
          { kind: "action", tool: event.tool, params: event.params },
        ]);
        break;
      case "agent/progress":
        setProgressLabel(event.label);
        break;
      case "agent/observation": {
        const data = event.result?.data;
        const imageUrl =
          data
          && typeof data === "object"
          && typeof (data as { imageUrl?: unknown }).imageUrl === "string"
            ? String((data as { imageUrl: string }).imageUrl)
            : undefined;
        setMessages((prev) => [
          ...prev,
          {
            kind: "observation",
            tool: event.tool,
            summary: event.result?.summary,
            error: event.error ?? event.result?.error,
            ...(imageUrl ? { imageUrl } : {}),
            ...(data != null && event.tool === "validate_citations" ? { data } : {}),
          },
        ]);
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
        setProgressLabel(null);
        setSummary(event.summary);
        setMessages((prev) => [...prev, { kind: "summary", summary: event.summary }]);
        setPendingCheckpoint(null);
        setStatus("completed");
        void refreshInterrupted();
        break;
      case "agent/error":
        setStreamingText("");
        setProgressLabel(null);
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

      if (userLine) {
        setMessages((prev) => [...prev, { kind: "user", text: userLine }]);
      }
      setPlan(null);
      setSummary(null);
      setLastPersisted(null);
      setPendingConfirm(null);
      setPendingCheckpoint(null);
      setStatus("planning");

      try {
        await postAgentStream(request, {
          signal: controller.signal,
          onEvent: handleEvent,
        });
        setStatus((prev) =>
          prev === "planning"
          || prev === "thinking"
          || prev === "executing"
          || prev === "finalizing"
            ? "completed"
            : prev,
        );
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          setStatus((prev) =>
            prev === "cancelled" || prev === "awaiting_checkpoint" ? prev : "cancelled",
          );
          void refreshInterrupted();
          return;
        }
        toast.error(getErrorMessage(error));
        setProgressLabel(null);
        setStatus("error");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
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
    async (approved: boolean) => {
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
          },
        },
        `确认执行：${pendingConfirm.tool}`,
      );
    },
    [runStream, sessionId, pendingConfirm, options.projectId],
  );

  const idleLike =
    status === "idle"
    || status === "completed"
    || status === "error"
    || status === "cancelled"
    || status === "awaiting_checkpoint";

  return {
    status,
    messages,
    streamingText,
    progressLabel,
    plan,
    summary,
    pendingConfirm,
    pendingCheckpoint,
    lastPersisted,
    lastProjectMutation,
    sessionId,
    interruptedSessions,
    historyLoaded,
    sendGoal,
    resumeSession,
    resolveCheckpoint,
    resolveConfirm,
    refreshInterrupted,
    cancel,
    reset,
    startNewChat,
    isRunning: !idleLike,
  };
}

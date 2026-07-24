"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AgentConfirmRequest,
  AgentPlan,
  AgentSSEEvent,
  AgentStatus,
  AgentSummary,
} from "@/contracts/agent";
import type { AgentSessionListItem } from "@/contracts/agent-session";
import { extractSectionPersisted, type AgentSectionPersistedInfo } from "@/lib/agent/section-persisted";
import { listAgentSessions, postAgentStream } from "@/services/agent";
import { getErrorMessage } from "@/lib/error-utils";

export type AgentMessage =
  | { kind: "user"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "action"; tool: string; params: Record<string, unknown> }
  | {
      kind: "observation";
      tool: string;
      summary?: string;
      error?: string;
    }
  | { kind: "summary"; summary: AgentSummary };

export interface UseAgentOptions {
  projectId?: string;
  directionSlug?: string;
  onSectionPersisted?: (info: AgentSectionPersistedInfo) => void;
}

export function useAgent(options: UseAgentOptions = {}) {
  const [status, setStatus] = useState<AgentStatus | "idle">("idle");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AgentConfirmRequest | null>(null);
  const [lastPersisted, setLastPersisted] = useState<AgentSectionPersistedInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [interruptedSessions, setInterruptedSessions] = useState<AgentSessionListItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const onPersistedRef = useRef(options.onSectionPersisted);
  useEffect(() => {
    onPersistedRef.current = options.onSectionPersisted;
  }, [options.onSectionPersisted]);

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

  useEffect(() => {
    void refreshInterrupted();
  }, [refreshInterrupted]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setMessages([]);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
    setLastPersisted(null);
    setSessionId(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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
      case "agent/thought":
        if (event.content?.trim()) {
          setMessages((prev) => [...prev, { kind: "thought", text: event.content! }]);
        }
        break;
      case "agent/action":
        setMessages((prev) => [
          ...prev,
          { kind: "action", tool: event.tool, params: event.params },
        ]);
        break;
      case "agent/observation": {
        setMessages((prev) => [
          ...prev,
          {
            kind: "observation",
            tool: event.tool,
            summary: event.result?.summary,
            error: event.error ?? event.result?.error,
          },
        ]);
        const persisted = extractSectionPersisted(event.tool, event.result);
        if (persisted) {
          setLastPersisted(persisted);
          onPersistedRef.current?.(persisted);
        }
        break;
      }
      case "agent/confirm":
        setPendingConfirm({
          tool: event.tool,
          params: event.params,
          message: event.message,
        });
        break;
      case "agent/complete":
        setSummary(event.summary);
        setMessages((prev) => [...prev, { kind: "summary", summary: event.summary }]);
        void refreshInterrupted();
        break;
      case "agent/error":
        toast.error(event.error);
        setStatus("error");
        void refreshInterrupted();
        break;
      default:
        break;
    }
  }, [refreshInterrupted]);

  const runStream = useCallback(
    async (request: Parameters<typeof postAgentStream>[0], userLine?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (userLine) {
        setMessages([{ kind: "user", text: userLine }]);
      }
      setPlan(null);
      setSummary(null);
      setPendingConfirm(null);
      setLastPersisted(null);
      setStatus("planning");

      try {
        await postAgentStream(request, {
          signal: controller.signal,
          onEvent: handleEvent,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          void refreshInterrupted();
          return;
        }
        toast.error(getErrorMessage(error));
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
    async (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed) return;
      await runStream(
        {
          goal: trimmed,
          projectId: options.projectId,
          directionSlug: options.directionSlug,
          mode: "auto",
        },
        trimmed,
      );
    },
    [runStream, options.projectId, options.directionSlug],
  );

  const resumeSession = useCallback(
    async (id: string) => {
      const target = interruptedSessions.find((s) => s.id === id);
      await runStream(
        {
          sessionId: id,
          resume: true,
          projectId: options.projectId,
          mode: "auto",
        },
        target ? `继续：${target.goal}` : "继续上次中断的任务",
      );
    },
    [runStream, interruptedSessions, options.projectId],
  );

  return {
    status,
    messages,
    plan,
    summary,
    pendingConfirm,
    lastPersisted,
    sessionId,
    interruptedSessions,
    sendGoal,
    resumeSession,
    refreshInterrupted,
    cancel,
    reset,
    isRunning: status !== "idle" && status !== "completed" && status !== "error" && status !== "cancelled",
  };
}

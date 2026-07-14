"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AgentConfirmRequest,
  AgentPlan,
  AgentSSEEvent,
  AgentStatus,
  AgentSummary,
} from "@/contracts/agent";
import { postAgentStream } from "@/services/agent";
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
}

export function useAgent(options: UseAgentOptions = {}) {
  const [status, setStatus] = useState<AgentStatus | "idle">("idle");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AgentConfirmRequest | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setMessages([]);
    setPlan(null);
    setSummary(null);
    setPendingConfirm(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("cancelled");
  }, []);

  const handleEvent = useCallback((event: AgentSSEEvent) => {
    switch (event.type) {
      case "agent/status":
        setStatus(event.status);
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
      case "agent/observation":
        setMessages((prev) => [
          ...prev,
          {
            kind: "observation",
            tool: event.tool,
            summary: event.result?.summary,
            error: event.error ?? event.result?.error,
          },
        ]);
        break;
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
        break;
      case "agent/error":
        toast.error(event.error);
        setStatus("error");
        break;
      default:
        break;
    }
  }, []);

  const sendGoal = useCallback(
    async (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setMessages([{ kind: "user", text: trimmed }]);
      setPlan(null);
      setSummary(null);
      setPendingConfirm(null);
      setStatus("planning");

      try {
        await postAgentStream(
          {
            goal: trimmed,
            projectId: options.projectId,
            directionSlug: options.directionSlug,
            mode: "auto",
          },
          {
            signal: controller.signal,
            onEvent: handleEvent,
          },
        );
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        toast.error(getErrorMessage(error));
        setStatus("error");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [handleEvent, options.projectId, options.directionSlug],
  );

  return {
    status,
    messages,
    plan,
    summary,
    pendingConfirm,
    sendGoal,
    cancel,
    reset,
    isRunning: status !== "idle" && status !== "completed" && status !== "error" && status !== "cancelled",
  };
}

import type { AgentSSEEvent } from "@/contracts/agent";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { getCompiledAgentGraph } from "@/lib/agent/langgraph/graph";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { appendPhasePackToBriefing } from "@/lib/agent/phase-task-pack";
import { loadAgentProject } from "@/lib/agent/project-loader";
import {
  graphStateToSnapshot,
} from "@/lib/agent/session-snapshot";
import {
  saveAgentSessionSnapshot,
} from "@/lib/agent/session-store";
import type { AgentLoopOptions } from "@/lib/agent/types";

export async function* runAgentGraphLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  const { goal, context, tools, sessionId, resumeState } = options;
  const graph = getCompiledAgentGraph();
  const repeatTracker = createRepeatTracker();

  if (!context.projectBriefing && context.projectId) {
    try {
      const snap = await loadAgentProject(context.userId, context.projectId);
      context.projectSnapshot = snap;
      context.projectBriefing = appendPhasePackToBriefing(
        formatAgentProjectBriefing(snap),
        snap,
      );
    } catch {
      context.projectSnapshot = null;
      context.projectBriefing = formatAgentProjectBriefing(null);
    }
  }

  const runtime: AgentGraphRuntime = {
    agentContext: context,
    tools,
    repeatTracker,
  };

  const initialState: Partial<AgentGraphStateType> = resumeState
    ? { ...resumeState, goal, events: [], finished: false, error: null }
    : {
        goal,
        messages: [{ role: "user", content: goal }],
      };

  const recursionLimit = Math.max(context.budget.maxIterations * 4, 16);
  let lastEventCount = 0;
  let lastPersistedAt = 0;
  let latestState: AgentGraphStateType | null = null;

  const persist = async (
    state: AgentGraphStateType,
    status?: "running" | "interrupted" | "completed" | "error",
    errorMessage?: string | null,
  ) => {
    if (!sessionId) return;
    const now = Date.now();
    // 运行中节流：最多约 1.5s 写一次；终态立即写
    if (status === "running" && now - lastPersistedAt < 1500) return;
    lastPersistedAt = now;
    try {
      await saveAgentSessionSnapshot(
        sessionId,
        graphStateToSnapshot(state),
        status,
        errorMessage,
      );
    } catch {
      /* 断点落盘失败不阻断主流程 */
    }
  };

  try {
    if (sessionId) {
      yield {
        type: "agent/session",
        sessionId,
        status: "running",
        resumed: Boolean(resumeState),
        toolSummaries: resumeState?.toolSummaries,
      };
    }

    const stream = await graph.stream(initialState, {
      streamMode: "values",
      recursionLimit,
      configurable: { agentRuntime: runtime },
      signal: context.signal,
    });

    for await (const snapshot of stream) {
      const state = snapshot as AgentGraphStateType;
      latestState = state;
      context.budget.toolCallCount = state.toolCallCount;
      context.budget.currentIteration = state.iteration;

      const pending = state.events.slice(lastEventCount);
      for (const event of pending) {
        yield event;
      }
      lastEventCount = state.events.length;

      await persist(state, "running");

      if (context.signal.aborted) {
        await persist(state, "interrupted");
        if (sessionId) {
          yield {
            type: "agent/session",
            sessionId,
            status: "interrupted",
            toolSummaries: state.toolSummaries,
          };
        }
        if (!pending.some((e) => e.type === "agent/status" && e.status === "cancelled")) {
          yield { type: "agent/status", status: "cancelled" };
        }
        return;
      }
    }

    if (latestState) {
      const terminal: "completed" | "error" = latestState.error ? "error" : "completed";
      await persist(latestState, terminal, latestState.error);
      if (sessionId) {
        yield {
          type: "agent/session",
          sessionId,
          status: terminal,
          toolSummaries: latestState.toolSummaries,
        };
      }
    }
  } catch (error) {
    if (context.signal.aborted) {
      if (latestState && sessionId) {
        await persist(latestState, "interrupted");
        yield {
          type: "agent/session",
          sessionId,
          status: "interrupted",
          toolSummaries: latestState.toolSummaries,
        };
      }
      yield { type: "agent/status", status: "cancelled" };
      return;
    }
    const message = error instanceof Error ? error.message : "Agent 图执行失败";
    if (latestState && sessionId) {
      await persist(latestState, "error", message);
      yield {
        type: "agent/session",
        sessionId,
        status: "error",
        toolSummaries: latestState.toolSummaries,
      };
    }
    yield { type: "agent/error", error: message };
  }
}

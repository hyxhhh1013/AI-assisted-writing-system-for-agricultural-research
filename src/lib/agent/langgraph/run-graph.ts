import type { AgentSSEEvent } from "@/contracts/agent";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { getCompiledAgentGraph } from "@/lib/agent/langgraph/graph";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentLoopOptions } from "@/lib/agent/types";

export async function* runAgentGraphLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  const { goal, context, tools } = options;
  const graph = getCompiledAgentGraph();
  const repeatTracker = createRepeatTracker();

  const runtime: AgentGraphRuntime = {
    agentContext: context,
    tools,
    repeatTracker,
  };

  const initialState: Partial<AgentGraphStateType> = {
    goal,
    messages: [{ role: "user", content: goal }],
  };

  const recursionLimit = Math.max(context.budget.maxIterations * 4, 16);
  let lastEventCount = 0;

  try {
    const stream = await graph.stream(initialState, {
      streamMode: "values",
      recursionLimit,
      configurable: { agentRuntime: runtime },
      signal: context.signal,
    });

    for await (const snapshot of stream) {
      const state = snapshot as AgentGraphStateType;
      const pending = state.events.slice(lastEventCount);
      for (const event of pending) {
        yield event;
      }
      lastEventCount = state.events.length;

      if (context.signal.aborted) {
        if (!pending.some((e) => e.type === "agent/status" && e.status === "cancelled")) {
          yield { type: "agent/status", status: "cancelled" };
        }
        return;
      }
    }
  } catch (error) {
    if (context.signal.aborted) {
      yield { type: "agent/status", status: "cancelled" };
      return;
    }
    const message = error instanceof Error ? error.message : "Agent 图执行失败";
    yield { type: "agent/error", error: message };
  }
}

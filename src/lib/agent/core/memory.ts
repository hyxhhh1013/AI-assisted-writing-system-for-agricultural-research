import type { AgentKeyFinding, AgentPlan } from "@/contracts/agent";
import type { LLMMessage, ToolDefinition } from "@/lib/agent/types";

const MAX_CONVERSATION = 20;
const COMPRESS_TO = 10;

export interface AgentMemoryState {
  iteration: number;
  goal: string;
  plan: AgentPlan | null;
  keyFindings: AgentKeyFinding[];
  toolSummaries: string[];
}

export interface AgentMemory {
  iteration: number;
  recordThought(content: string | null): void;
  recordPlan(plan: AgentPlan): void;
  recordObservation(tool: string, result: { success: boolean; summary?: string; error?: string }): void;
  recordKeyFinding(finding: AgentKeyFinding): void;
  recordError(message: string): void;
  buildMessages(systemPrompt: string): LLMMessage[];
  buildSummary(finalThought: string | null): { text: string; keyFindings: AgentKeyFinding[]; toolCallCount: number };
}

export function createMemory(goal: string, _tools: ToolDefinition[]): AgentMemory {
  const conversation: LLMMessage[] = [{ role: "user", content: goal }];
  const state: AgentMemoryState = {
    iteration: 0,
    goal,
    plan: null,
    keyFindings: [],
    toolSummaries: [],
  };

  function maybeCompress(): void {
    if (conversation.length <= MAX_CONVERSATION) return;
    const removed = conversation.splice(0, conversation.length - COMPRESS_TO);
    const summary = removed
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");
    conversation.unshift({
      role: "user",
      content: `[Earlier conversation summary]\n${summary}`,
    });
  }

  return {
    get iteration() {
      return state.iteration;
    },
    set iteration(v: number) {
      state.iteration = v;
    },

    recordThought(content) {
      if (content?.trim()) {
        conversation.push({ role: "assistant", content });
        maybeCompress();
      }
    },

    recordPlan(plan) {
      state.plan = plan;
      conversation.push({
        role: "assistant",
        content: `Plan:\n${plan.subtasks.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`,
      });
      maybeCompress();
    },

    recordObservation(tool, result) {
      const line = result.success
        ? `[${tool}] ${result.summary ?? "完成"}`
        : `[${tool}] 失败: ${result.error ?? "未知错误"}`;
      state.toolSummaries.push(line);
      conversation.push({ role: "user", content: `Tool result (${tool}):\n${line}` });
      maybeCompress();
    },

    recordKeyFinding(finding) {
      state.keyFindings.push(finding);
    },

    recordError(message) {
      conversation.push({ role: "user", content: `[System error] ${message}` });
      maybeCompress();
    },

    buildMessages(systemPrompt) {
      return [{ role: "system", content: systemPrompt }, ...conversation];
    },

    buildSummary(finalThought) {
      const parts = [
        finalThought?.trim(),
        state.toolSummaries.length > 0
          ? `执行摘要:\n${state.toolSummaries.join("\n")}`
          : null,
      ].filter(Boolean);
      return {
        text: parts.join("\n\n") || "任务已完成。",
        keyFindings: state.keyFindings,
        toolCallCount: state.toolSummaries.length,
      };
    },
  };
}

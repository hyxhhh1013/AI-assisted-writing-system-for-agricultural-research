import { describe, expect, it } from "vitest";
import {
  LiveEventQueue,
  mergeGraphAndLive,
} from "@/lib/agent/langgraph/run-graph";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

describe("mergeGraphAndLive", () => {
  it("实时事件在 graph 快照前先产出（write_section 进度不被阻塞）", async () => {
    const queue = new LiveEventQueue();
    const graphStream = (async function* (): AsyncGenerator<AgentGraphStateType> {
      // graph 快照被 LLM 长调用阻塞，20ms 后才产出
      await new Promise((r) => setTimeout(r, 20));
      yield {} as AgentGraphStateType;
    })();
    queue.push({ type: "agent/progress", label: "正在撰写「引言」· 生成初稿…" });

    const order: string[] = [];
    for await (const item of mergeGraphAndLive(graphStream, queue)) {
      order.push(item.type);
    }
    expect(order).toEqual(["live", "graph"]);
  });

  it("graph 立即完成时，缓冲的实时事件仍被交付（排空路径）", async () => {
    const queue = new LiveEventQueue();
    const graphStream = (async function* (): AsyncGenerator<AgentGraphStateType> {
      // 无任何快照产出，立即完成
      return;
    })();
    queue.push({ type: "agent/progress", label: "x" });

    const order: string[] = [];
    for await (const item of mergeGraphAndLive(graphStream, queue)) {
      order.push(item.type);
    }
    expect(order).toEqual(["live"]);
  });

  it("graph 完成后没有实时事件则直接结束", async () => {
    const queue = new LiveEventQueue();
    const graphStream = (async function* (): AsyncGenerator<AgentGraphStateType> {
      yield {} as AgentGraphStateType;
    })();

    const order: string[] = [];
    for await (const item of mergeGraphAndLive(graphStream, queue)) {
      order.push(item.type);
    }
    expect(order).toEqual(["graph"]);
  });
});

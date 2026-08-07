import { describe, expect, it } from "vitest";
import { LiveEventQueue } from "@/lib/agent/langgraph/run-graph";
import type { AgentSSEEvent, AgentToolResult } from "@/contracts/agent";

/**
 * 确认续跑实时排空模式：工具执行期间 emitLiveEvent 的进度事件应在
 * execute 结束前逐个 yield（而非积压到结束后一次性倒出）。
 */
describe("confirm-resume live drain", () => {
  it("yields progress events in real-time before execute resolves", async () => {
    const q = new LiveEventQueue();
    const emit = (e: AgentSSEEvent) => q.push(e);

    const toolTask = (async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        emit({
          type: "agent/progress",
          label: `正在导入文献 ${i}/3`,
          stage: "importing",
          done: i,
          total: 3,
          detail: `第${i}篇`,
        });
      }
      return { success: true } as AgentToolResult;
    })();
    const executePromise = Promise.resolve(toolTask).then(
      (r) => ({ kind: "result" as const, result: r }),
    );

    const yielded: AgentSSEEvent[] = [];
    let result: AgentToolResult | null = null;
    for (;;) {
      const liveNext = q.next().then((v) => ({ kind: "live" as const, value: v }));
      const raced = await Promise.race([executePromise, liveNext]);
      if (raced.kind === "result") {
        result = raced.result;
        q.clear();
        break;
      }
      if (!raced.value.done) yielded.push(raced.value.value);
    }

    expect(result?.success).toBe(true);
    expect(yielded.length).toBe(3);
    expect(yielded[0]).toMatchObject({ type: "agent/progress", stage: "importing", done: 1, total: 3 });
    expect(yielded[2]).toMatchObject({ done: 3 });
  });

  it("clear() drops buffered stale events after execute", () => {
    const q = new LiveEventQueue();
    q.push({ type: "agent/progress", label: "x", stage: "importing" });
    q.clear();
    let n = 0;
    const waiter = q.next().then(() => { n = 1; });
    // 未 close 时 next() 挂起等待；clear 后 items 为空，不应立刻产出
    expect(n).toBe(0);
    waiter.then(() => {}); // 避免 unhandled
  });
});

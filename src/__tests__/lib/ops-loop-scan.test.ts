import { describe, expect, it } from "vitest";
import { classifyLoopSessions } from "@/lib/ops-loop-scan";
import type { LoopScanInput } from "@/lib/ops-loop-scan";

function row(partial: Partial<LoopScanInput> & Pick<LoopScanInput, "id">): LoopScanInput {
  return {
    status: "completed",
    updatedAt: "2026-10-15T00:00:00.000Z",
    ui: [],
    toolTrace: [],
    ...partial,
  };
}

describe("classifyLoopSessions", () => {
  it("marks three identical calls in one turn as same_call", () => {
    const [session] = classifyLoopSessions([
      row({
        id: "same",
        ui: [
          { kind: "user", text: "继续" },
          { kind: "action", tool: "search_knowledge", params: { query: "茶多酚" } },
          { kind: "action", tool: "search_knowledge", params: { query: "茶多酚" } },
          { kind: "action", tool: "search_knowledge", params: { query: "茶多酚" } },
        ],
      }),
    ]);
    expect(session.turns[0]?.codes).toContain("same_call");
  });

  it("drops search_no_gain when the next turn imports", () => {
    const [session] = classifyLoopSessions([
      row({
        id: "gain",
        ui: [
          { kind: "user", text: "找文献" },
          ...Array.from({ length: 4 }, () => ({ kind: "action", tool: "search_knowledge", params: { query: "a" } })),
          { kind: "user", text: "导入" },
          { kind: "observation", tool: "import_reference" },
        ],
      }),
    ]);
    const codes = session.turns.flatMap((turn) => turn.codes);
    expect(codes).not.toContain("search_no_gain");
  });

  it("counts a six-call search storm and a three-cycle ping pong", () => {
    const storm = classifyLoopSessions([
      row({
        id: "storm",
        ui: [
          { kind: "user", text: "再搜" },
          ...Array.from({ length: 6 }, (_, i) => ({
            kind: "action",
            tool: i % 2 === 0 ? "search_knowledge" : "search_external",
            params: { query: `q${i}` },
          })),
        ],
      }),
    ])[0];
    expect(storm.turns[0]?.codes).toContain("search_storm");

    const names = ["plot_curve", "generate_chart", "plot_curve", "generate_chart", "plot_curve", "generate_chart"];
    const pong = classifyLoopSessions([
      row({
        id: "pong",
        ui: [
          { kind: "user", text: "改图" },
          ...names.map((tool) => ({ kind: "action", tool, params: { n: tool } })),
        ],
      }),
    ])[0];
    expect(pong.turns[0]?.codes).toContain("ping_pong");
  });

  it("flags a running session that has not updated for over an hour", () => {
    const now = Date.parse("2026-10-15T04:00:00.000Z");
    const [session] = classifyLoopSessions(
      [row({ id: "stuck", status: "running", updatedAt: "2026-10-15T02:00:00.000Z" })],
      now,
    );
    expect(session.codes).toContain("stuck_running");
  });

  it("flags a tool bounced by the pre-gate twice", () => {
    const [session] = classifyLoopSessions([
      row({
        id: "gate",
        toolTrace: [
          { tool: "write_section", via: "pre-gate", reason: "先检索" },
          { tool: "write_section", via: "pre-gate", reason: "先检索" },
        ],
      }),
    ]);
    expect(session.codes).toContain("gate_bounce");
  });
});

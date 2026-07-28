import { describe, expect, it } from "vitest";
import {
  applyWorkMemoryOp,
  emptyWorkMemory,
  formatWorkMemoryBlock,
  normalizeWorkMemory,
} from "@/lib/agent/work-memory";

describe("work memory", () => {
  it("sets thesis and decisions", () => {
    let mem = emptyWorkMemory();
    mem = applyWorkMemoryOp(mem, { op: "set_thesis", text: "生物炭提升土壤有机质" });
    mem = applyWorkMemoryOp(mem, { op: "add_decision", text: "用户批准先写引言" });
    expect(mem.thesis).toMatch(/生物炭/);
    expect(mem.decisions).toHaveLength(1);
    const block = formatWorkMemoryBlock(mem);
    expect(block).toMatch(/主张/);
    expect(block).toMatch(/已确认/);
  });

  it("completes todos by id or text", () => {
    let mem = applyWorkMemoryOp(null, { op: "add_todo", text: "导入 3 篇文献", id: "t1" });
    mem = applyWorkMemoryOp(mem, { op: "complete_todo", id: "t1" });
    expect(mem.todos[0]?.done).toBe(true);
    mem = applyWorkMemoryOp(mem, { op: "add_todo", text: "生成大纲" });
    mem = applyWorkMemoryOp(mem, { op: "complete_todo", text: "大纲" });
    expect(mem.todos.some((t) => t.text.includes("大纲") && t.done)).toBe(true);
  });

  it("normalizes junk input", () => {
    expect(normalizeWorkMemory(null)).toBeNull();
    expect(normalizeWorkMemory({ thesis: 1, decisions: "x" })).toEqual({
      thesis: undefined,
      decisions: [],
      todos: [],
      updatedAt: expect.any(Number),
    });
  });
});

/**
 * W3-AP-WORK-MEMORY — 本会话主张 / 已否决策 / 待办
 */

export interface AgentWorkDecision {
  text: string;
  at: number;
}

export interface AgentWorkTodo {
  id: string;
  text: string;
  done: boolean;
  at: number;
}

export interface AgentWorkMemory {
  /** 核心主张 / 论文论点一句话 */
  thesis?: string;
  /** 用户已拍板或否决的决策 */
  decisions: AgentWorkDecision[];
  /** 待办 */
  todos: AgentWorkTodo[];
  updatedAt: number;
}

export function emptyWorkMemory(): AgentWorkMemory {
  return { decisions: [], todos: [], updatedAt: Date.now() };
}

export function normalizeWorkMemory(raw: unknown): AgentWorkMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as {
    thesis?: unknown;
    decisions?: unknown;
    todos?: unknown;
    updatedAt?: unknown;
  };
  const decisions = Array.isArray(v.decisions)
    ? v.decisions
        .filter(
          (d): d is AgentWorkDecision =>
            !!d
            && typeof d === "object"
            && typeof (d as AgentWorkDecision).text === "string",
        )
        .map((d) => ({
          text: String(d.text).trim().slice(0, 200),
          at: typeof d.at === "number" ? d.at : Date.now(),
        }))
        .filter((d) => d.text)
    : [];
  const todos = Array.isArray(v.todos)
    ? v.todos
        .filter(
          (t): t is AgentWorkTodo =>
            !!t
            && typeof t === "object"
            && typeof (t as AgentWorkTodo).id === "string"
            && typeof (t as AgentWorkTodo).text === "string",
        )
        .map((t) => ({
          id: String(t.id).slice(0, 40),
          text: String(t.text).trim().slice(0, 200),
          done: Boolean(t.done),
          at: typeof t.at === "number" ? t.at : Date.now(),
        }))
        .filter((t) => t.text)
    : [];
  const thesis =
    typeof v.thesis === "string" && v.thesis.trim()
      ? v.thesis.trim().slice(0, 300)
      : undefined;
  return {
    thesis,
    decisions: decisions.slice(-12),
    todos: todos.slice(-16),
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now(),
  };
}

export function formatWorkMemoryBlock(mem: AgentWorkMemory | null | undefined): string {
  if (!mem) return "";
  const lines: string[] = ["【本会话工作记忆】"];
  if (mem.thesis) lines.push(`- 主张：${mem.thesis}`);
  if (mem.decisions.length) {
    lines.push("- 已确认/否决：");
    for (const d of mem.decisions.slice(-6)) {
      lines.push(`  · ${d.text}`);
    }
  }
  const open = mem.todos.filter((t) => !t.done);
  const done = mem.todos.filter((t) => t.done);
  if (open.length) {
    lines.push("- 待办：");
    for (const t of open.slice(0, 8)) lines.push(`  · [ ] ${t.text}`);
  }
  if (done.length) {
    lines.push(`- 已完成 ${done.length} 项`);
  }
  if (lines.length <= 1) return "";
  return lines.join("\n");
}

export type WorkMemoryOp =
  | { op: "set_thesis"; text: string }
  | { op: "add_decision"; text: string }
  | { op: "add_todo"; text: string; id?: string }
  | { op: "complete_todo"; id?: string; text?: string }
  | { op: "clear_todos" };

export function applyWorkMemoryOp(
  prev: AgentWorkMemory | null | undefined,
  op: WorkMemoryOp,
): AgentWorkMemory {
  const base = normalizeWorkMemory(prev) ?? emptyWorkMemory();
  const now = Date.now();

  switch (op.op) {
    case "set_thesis": {
      const text = op.text.trim().slice(0, 300);
      return { ...base, thesis: text || undefined, updatedAt: now };
    }
    case "add_decision": {
      const text = op.text.trim().slice(0, 200);
      if (!text) return base;
      return {
        ...base,
        decisions: [...base.decisions, { text, at: now }].slice(-12),
        updatedAt: now,
      };
    }
    case "add_todo": {
      const text = op.text.trim().slice(0, 200);
      if (!text) return base;
      const id = (op.id?.trim() || `todo_${now}`).slice(0, 40);
      const todos = base.todos.filter((t) => t.id !== id);
      todos.push({ id, text, done: false, at: now });
      return { ...base, todos: todos.slice(-16), updatedAt: now };
    }
    case "complete_todo": {
      const id = op.id?.trim();
      const text = op.text?.trim().toLowerCase();
      return {
        ...base,
        todos: base.todos.map((t) => {
          if (id && t.id === id) return { ...t, done: true };
          if (text && t.text.toLowerCase().includes(text)) return { ...t, done: true };
          return t;
        }),
        updatedAt: now,
      };
    }
    case "clear_todos":
      return { ...base, todos: [], updatedAt: now };
    default:
      return base;
  }
}

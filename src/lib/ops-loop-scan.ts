/**
 * 线上 Agent 空转病码。规则与 scripts/harvest-agent-loop.py 对齐，只读、不调模型。
 */

const SEARCH_TOOLS = new Set(["search_external", "search_knowledge"]);
const MAX_TOOLS_PER_TURN = 16;
const MAX_ITERATIONS = 32;
const MAX_TOOL_CALLS = 64;

const CODE_LABEL: Record<string, string> = {
  same_call: "同一轮内同工具同参数调至少 3 次",
  read_repeat: "同一 read_section 窗口连续读至少 3 次",
  search_storm: "同一轮检索至少 6 次",
  search_no_gain: "同一轮检索至少 4 次且没有成功导入",
  ping_pong: "两个工具来回交替至少 3 个来回",
  fail_retry: "同一工具连续失败至少 2 次",
  long_turn: "一轮工具调用超过 16 次",
  gate_bounce: "同一工具被前置门禁拦至少 2 次",
  antispam_break: "触发空转熔断",
  forced_stop: "空转熔断后强制结束",
  budget: "撞迭代或工具总数预算",
  stuck_running: "状态仍是 running 且超过 1 小时没更新",
  session_error: "会话以 error 结束",
  figure_qa_wall: "出图质检撞墙",
  phase_shadow_block: "阶段影子拦截",
};

export interface LoopUiMessage {
  kind?: string;
  text?: string;
  tool?: string;
  params?: unknown;
  error?: string;
}

export interface LoopTraceItem {
  tool?: string;
  via?: string;
  reason?: string;
}

export interface LoopScanInput {
  id: string;
  status: string;
  updatedAt: string;
  errorMessage?: string | null;
  error?: string | null;
  iteration?: number;
  toolCallCount?: number;
  ui: LoopUiMessage[];
  toolTrace: LoopTraceItem[];
}

interface LoopTurn {
  user: string;
  actions: LoopUiMessage[];
  observations: LoopUiMessage[];
}

export interface LoopTurnHit {
  turn: number;
  user: string;
  codes: string[];
  seq: string;
}

export interface ClassifiedSession {
  id: string;
  status: string;
  updatedAt: string;
  codes: string[];
  turns: LoopTurnHit[];
  turnCount: number;
}

function paramsKey(params: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return "";
  const lite: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "userConfirmed" || key === "selectedIndices") continue;
    lite[key] = value;
  }
  const keys = Object.keys(lite).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = lite[key];
  return JSON.stringify(ordered).slice(0, 300);
}

function splitTurns(ui: LoopUiMessage[]): LoopTurn[] {
  const turns: LoopTurn[] = [];
  let cur: LoopTurn = { user: "(会话开头)", actions: [], observations: [] };
  for (const message of ui) {
    if (message.kind === "user") {
      if (cur.actions.length || cur.observations.length) turns.push(cur);
      cur = { user: message.text || "", actions: [], observations: [] };
    } else if (message.kind === "action") {
      cur.actions.push(message);
    } else if (message.kind === "observation") {
      cur.observations.push(message);
    }
  }
  if (cur.actions.length || cur.observations.length) turns.push(cur);
  return turns;
}

function compressSeq(names: string[], cap = 14): string {
  const out: string[] = [];
  for (const name of names) {
    const last = out[out.length - 1];
    if (last && last.split("×")[0] === name) {
      const parts = last.split("×");
      const n = Number(parts[1] || "1");
      out[out.length - 1] = `${parts[0]}×${n + 1}`;
    } else {
      out.push(name);
    }
  }
  const text = out.slice(0, cap).join(" → ");
  return out.length > cap ? `${text} → …` : text;
}

function maxConsecutive(keys: string[]): number {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const key of keys) {
    cur = key === prev ? cur + 1 : 1;
    prev = key;
    if (cur > best) best = cur;
  }
  return best;
}

function pingPongCycles(names: string[]): number {
  let best = 0;
  let i = 0;
  while (i + 1 < names.length) {
    const a = names[i];
    const b = names[i + 1];
    if (a === b) {
      i += 1;
      continue;
    }
    let j = i + 2;
    while (j < names.length && names[j] === ((j - i) % 2 === 0 ? a : b)) {
      j += 1;
    }
    const cycles = Math.floor((j - i) / 2);
    if (cycles > best) best = cycles;
    i += 1;
  }
  return best;
}

function classifyTurn(turn: LoopTurn): string[] {
  const codes: string[] = [];
  const names = turn.actions.map((action) => String(action.tool || ""));
  const callKeys = new Map<string, number>();
  for (const action of turn.actions) {
    const key = `${action.tool}|${paramsKey(action.params)}`;
    callKeys.set(key, (callKeys.get(key) ?? 0) + 1);
  }
  const maxCalls = Math.max(0, ...callKeys.values());
  if (callKeys.size > 0 && maxCalls >= 3) codes.push("same_call");

  const readKeys = turn.actions.map((action, index) =>
    action.tool === "read_section" ? paramsKey(action.params) : `#${index}`,
  );
  if (maxConsecutive(readKeys) >= 3) codes.push("read_repeat");

  const searches = names.filter((name) => SEARCH_TOOLS.has(name)).length;
  if (searches >= 6) codes.push("search_storm");
  const imported = turn.observations.some(
    (obs) => obs.tool === "import_reference" && !obs.error,
  );
  if (searches >= 4 && !imported) codes.push("search_no_gain");
  if (pingPongCycles(names) >= 3) codes.push("ping_pong");

  const failKeys = turn.observations.map((obs, index) =>
    obs.error ? String(obs.tool) : `#ok${index}`,
  );
  if (maxConsecutive(failKeys) >= 2) codes.push("fail_retry");
  if (turn.actions.length > MAX_TOOLS_PER_TURN) codes.push("long_turn");
  return codes;
}

function nextTurnImportSucceeded(turn: LoopTurn): boolean {
  for (const obs of turn.observations) {
    if (obs.tool === "import_reference") return !obs.error;
  }
  return false;
}

function applySearchGainCarry(turns: LoopTurn[], coded: string[][]): void {
  for (let i = 0; i < coded.length; i += 1) {
    const codes = coded[i];
    if (!codes.includes("search_no_gain")) continue;
    const next = turns[i + 1];
    if (next && nextTurnImportSucceeded(next)) {
      const at = codes.indexOf("search_no_gain");
      if (at >= 0) codes.splice(at, 1);
    }
  }
}

function traceSessionCodes(trace: LoopTraceItem[]): string[] {
  const codes: string[] = [];
  if (trace.some((item) => item.tool === "figure_qa_wall")) codes.push("figure_qa_wall");
  if (trace.some((item) => item.via === "phase-shadow")) codes.push("phase_shadow_block");
  const seen = new Set<string>();
  for (const item of trace) {
    if (item.via !== "wall") continue;
    const code = `wall_${item.tool || "unknown"}`;
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function classifySession(row: LoopScanInput, nowMs: number): ClassifiedSession {
  const codes: string[] = [];
  const trace = row.toolTrace;
  const gateHits = new Map<string, number>();
  for (const item of trace) {
    if (item.via !== "pre-gate") continue;
    const tool = item.tool || "";
    gateHits.set(tool, (gateHits.get(tool) ?? 0) + 1);
  }
  if (gateHits.size > 0 && Math.max(...gateHits.values()) >= 2) codes.push("gate_bounce");
  if (trace.some((item) => item.tool === "antispam")) codes.push("antispam_break");

  const stopText = [row.error || "", row.errorMessage || "", ...trace.map((item) => item.reason || "")].join(" ");
  if (stopText.includes("强制结束")) codes.push("forced_stop");

  const iteration = row.iteration ?? 0;
  const calls = row.toolCallCount ?? 0;
  if (
    trace.some((item) => item.via === "budget")
    || iteration >= MAX_ITERATIONS
    || calls >= MAX_TOOL_CALLS
  ) {
    codes.push("budget");
  }
  for (const extra of traceSessionCodes(trace)) {
    if (!codes.includes(extra)) codes.push(extra);
  }
  if (row.status === "error") codes.push("session_error");
  if (row.status === "running") {
    const updated = Date.parse(row.updatedAt);
    if (Number.isFinite(updated) && nowMs - updated > 60 * 60 * 1000) {
      codes.push("stuck_running");
    }
  }

  const turns = splitTurns(row.ui);
  const coded = turns.map((turn) => classifyTurn(turn));
  applySearchGainCarry(turns, coded);
  const turnHits: LoopTurnHit[] = [];
  turns.forEach((turn, index) => {
    const turnCodes = coded[index] ?? [];
    if (turnCodes.length === 0) return;
    turnHits.push({
      turn: index,
      user: turn.user.slice(0, 60).replace(/\n/g, " "),
      codes: turnCodes,
      seq: compressSeq(turn.actions.map((action) => String(action.tool || ""))),
    });
  });
  return {
    id: row.id,
    status: row.status,
    updatedAt: row.updatedAt,
    codes,
    turns: turnHits,
    turnCount: turns.length,
  };
}

export function codeLabel(code: string): string {
  if (CODE_LABEL[code]) return CODE_LABEL[code];
  if (code.startsWith("wall_")) return `轨迹撞墙：${code.slice("wall_".length)}`;
  return code;
}

export function classifyLoopSessions(rows: LoopScanInput[], nowMs = Date.now()): ClassifiedSession[] {
  return rows.map((row) => classifySession(row, nowMs));
}

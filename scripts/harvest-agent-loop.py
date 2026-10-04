#!/usr/bin/env python3
"""线上 Agent 转圈语料：按用户轮次扫最近会话，给空转 / 门禁回弹 / 熔断打病码并统计分布。

在生产机跑：
  python3 /tmp/harvest-agent-loop.py [--limit 200] [--out /tmp/agent-loop-corpus.jsonl]

只读，不改库。病码是确定性规则，不调 LLM。
"""
from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

SEARCH_TOOLS = {"search_external", "search_knowledge"}
MAX_TOOLS_PER_TURN = 16
MAX_ITERATIONS = 32
MAX_TOOL_CALLS = 64

CODE_DESC = {
    "same_call": "同一轮内同工具同参数调 ≥3 次",
    "read_repeat": "同一 read_section 窗口连续读 ≥3 次",
    "search_storm": "同一轮 search_* ≥6 次",
    "search_no_gain": "同一轮搜 ≥4 次且没有成功导入",
    "ping_pong": "两个工具来回交替 ≥3 个来回",
    "fail_retry": "同一工具连续失败 ≥2 次",
    "long_turn": f"一轮工具调用 >{MAX_TOOLS_PER_TURN} 次",
    "gate_bounce": "同一工具被前置门禁拦 ≥2 次",
    "antispam_break": "触发空转熔断",
    "forced_stop": "空转熔断累计后强制结束",
    "budget": "撞迭代 / 工具总数预算",
    "stuck_running": "状态 running 但 1 小时没更新",
    "session_error": "会话以 error 结束",
}


def psql(sql: str) -> str:
    return subprocess.check_output(
        ["sudo", "-u", "postgres", "psql", "-d", "grainscript", "-tA", "-c", sql],
        text=True,
        stderr=subprocess.STDOUT,
    )


def fetch_sessions(limit: int) -> list[dict]:
    sql = f"""
SELECT json_build_object(
  'sid', id,
  'status', status,
  'updatedAt', "updatedAt",
  'errorMessage', left(COALESCE("errorMessage", ''), 200),
  'intentKind', snapshot->>'intentKind',
  'iteration', snapshot->'iteration',
  'toolCallCount', snapshot->'toolCallCount',
  'error', left(COALESCE(snapshot->>'error', ''), 200),
  'toolTrace', COALESCE(snapshot->'toolTrace', '[]'::jsonb),
  'ui', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind', m->>'kind',
      'text', left(COALESCE(m->>'text', ''), 120),
      'tool', m->>'tool',
      'params', m->'params',
      'error', left(COALESCE(m->>'error', ''), 160)
    ))
    FROM jsonb_array_elements(COALESCE(snapshot->'uiTranscript', '[]'::jsonb)) AS m
    WHERE m->>'kind' IN ('user', 'action', 'observation')
  ), '[]'::jsonb)
)::text
FROM "AgentSession"
ORDER BY "updatedAt" DESC
LIMIT {limit};
"""
    rows = []
    for line in psql(sql).splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def params_key(params: object) -> str:
    if not isinstance(params, dict):
        return ""
    lite = {k: v for k, v in params.items() if k not in ("userConfirmed", "selectedIndices")}
    return json.dumps(lite, ensure_ascii=False, sort_keys=True)[:300]


def split_turns(ui: list[dict]) -> list[dict]:
    """uiTranscript 按 user 气泡切轮；系统注入的检查点/确认也算一轮。"""
    turns: list[dict] = []
    cur = {"user": "(会话开头)", "actions": [], "observations": []}
    for m in ui:
        kind = m.get("kind")
        if kind == "user":
            if cur["actions"] or cur["observations"]:
                turns.append(cur)
            cur = {"user": m.get("text") or "", "actions": [], "observations": []}
        elif kind == "action":
            cur["actions"].append(m)
        elif kind == "observation":
            cur["observations"].append(m)
    if cur["actions"] or cur["observations"]:
        turns.append(cur)
    return turns


def compress_seq(names: list[str], cap: int = 14) -> str:
    out: list[str] = []
    for name in names:
        if out and out[-1].split("×")[0] == name:
            base, _, n = out[-1].partition("×")
            out[-1] = f"{base}×{int(n or 1) + 1}"
        else:
            out.append(name)
    text = " → ".join(out[:cap])
    return text + (" → …" if len(out) > cap else "")


def max_consecutive(keys: list[str]) -> int:
    best = cur = 0
    prev = None
    for k in keys:
        cur = cur + 1 if k == prev else 1
        prev = k
        best = max(best, cur)
    return best


def ping_pong_cycles(names: list[str]) -> int:
    """最长 ABAB… 交替段的来回数（A≠B）。"""
    best = 0
    i = 0
    while i + 1 < len(names):
        a, b = names[i], names[i + 1]
        if a == b:
            i += 1
            continue
        j = i + 2
        while j < len(names) and names[j] == (a if (j - i) % 2 == 0 else b):
            j += 1
        best = max(best, (j - i) // 2)
        i += 1
    return best


def classify_turn(turn: dict) -> list[str]:
    codes: list[str] = []
    actions = turn["actions"]
    names = [str(a.get("tool") or "") for a in actions]

    call_keys = Counter(f"{a.get('tool')}|{params_key(a.get('params'))}" for a in actions)
    if call_keys and max(call_keys.values()) >= 3:
        codes.append("same_call")

    read_keys = [
        params_key(a.get("params")) if a.get("tool") == "read_section" else f"#{i}"
        for i, a in enumerate(actions)
    ]
    if max_consecutive(read_keys) >= 3:
        codes.append("read_repeat")

    searches = sum(1 for n in names if n in SEARCH_TOOLS)
    if searches >= 6:
        codes.append("search_storm")
    imported = any(
        o.get("tool") == "import_reference" and not o.get("error")
        for o in turn["observations"]
    )
    if searches >= 4 and not imported:
        codes.append("search_no_gain")

    if ping_pong_cycles(names) >= 3:
        codes.append("ping_pong")

    fail_keys = [
        str(o.get("tool")) if o.get("error") else f"#ok{i}"
        for i, o in enumerate(turn["observations"])
    ]
    if max_consecutive(fail_keys) >= 2:
        codes.append("fail_retry")

    if len(actions) > MAX_TOOLS_PER_TURN:
        codes.append("long_turn")
    return codes


def classify_session(row: dict) -> tuple[list[str], list[dict]]:
    codes: list[str] = []
    trace = row.get("toolTrace") or []

    gate_hits = Counter(t.get("tool") for t in trace if t.get("via") == "pre-gate")
    if gate_hits and max(gate_hits.values()) >= 2:
        codes.append("gate_bounce")
    if any(t.get("tool") == "antispam" for t in trace):
        codes.append("antispam_break")
    stop_text = " ".join(
        [str(row.get("error") or ""), str(row.get("errorMessage") or "")]
        + [str(t.get("reason") or "") for t in trace]
    )
    if "强制结束" in stop_text:
        codes.append("forced_stop")
    iteration = row.get("iteration") or 0
    calls = row.get("toolCallCount") or 0
    if (
        any(t.get("via") == "budget" for t in trace)
        or (isinstance(iteration, int) and iteration >= MAX_ITERATIONS)
        or (isinstance(calls, int) and calls >= MAX_TOOL_CALLS)
    ):
        codes.append("budget")
    if row.get("status") == "error":
        codes.append("session_error")
    if row.get("status") == "running":
        try:
            updated = datetime.fromisoformat(str(row.get("updatedAt"))[:19])
            if datetime.now(timezone.utc).replace(tzinfo=None) - updated > timedelta(hours=1):
                codes.append("stuck_running")
        except ValueError:
            pass

    turn_hits: list[dict] = []
    for idx, turn in enumerate(split_turns(row.get("ui") or [])):
        tcodes = classify_turn(turn)
        if tcodes:
            turn_hits.append({
                "turn": idx,
                "user": turn["user"][:60].replace("\n", " "),
                "codes": tcodes,
                "tools": [
                    {"tool": a.get("tool"), "params": params_key(a.get("params"))}
                    for a in turn["actions"]
                ],
                "seq": compress_seq([str(a.get("tool")) for a in turn["actions"]]),
            })
    return codes, turn_hits


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--out", default="")
    ap.add_argument("--examples", type=int, default=4)
    args = ap.parse_args()

    rows = fetch_sessions(args.limit)
    code_sessions: Counter[str] = Counter()
    code_turns: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)
    gate_reasons: Counter[str] = Counter()
    status_count: Counter[str] = Counter()
    intent_by_code: dict[str, Counter[str]] = defaultdict(Counter)
    sick_sessions = 0
    total_turns = 0
    corpus: list[dict] = []

    for row in rows:
        status_count[str(row.get("status"))] += 1
        total_turns += len(split_turns(row.get("ui") or []))
        for t in row.get("toolTrace") or []:
            if t.get("via") == "pre-gate":
                gate_reasons[f"{t.get('tool')}: {str(t.get('reason') or '')[:70]}"] += 1

        scodes, turn_hits = classify_session(row)
        all_codes = set(scodes)
        for hit in turn_hits:
            for c in hit["codes"]:
                code_turns[c] += 1
                all_codes.add(c)
                if len(examples[c]) < args.examples:
                    examples[c].append(
                        f"{str(row['sid'])[:12]} [{row.get('intentKind') or '-'}] "
                        f"「{hit['user']}」 {hit['seq']}"
                    )
        for c in scodes:
            if len(examples[c]) < args.examples:
                tail = compress_seq([str(t.get("tool")) for t in (row.get("toolTrace") or [])][-10:])
                examples[c].append(
                    f"{str(row['sid'])[:12]} [{row.get('intentKind') or '-'}] "
                    f"status={row.get('status')} trace尾: {tail}"
                )
        for c in all_codes:
            code_sessions[c] += 1
            intent_by_code[c][str(row.get("intentKind") or "-")] += 1
        if all_codes:
            sick_sessions += 1
            corpus.append({
                "sid": row["sid"],
                "status": row.get("status"),
                "intentKind": row.get("intentKind"),
                "sessionCodes": scodes,
                "turns": turn_hits,
                "traceTail": (row.get("toolTrace") or [])[-15:],
            })

    print(f"sessions={len(rows)} turns={total_turns} 有病码的会话={sick_sessions}")
    print("status:", dict(status_count))
    print()
    print("=== 病码分布（会话数 / 命中轮数）===")
    for code in sorted(CODE_DESC, key=lambda c: -code_sessions[c]):
        if not code_sessions[code]:
            continue
        intents = ", ".join(f"{k}:{v}" for k, v in intent_by_code[code].most_common(4))
        print(
            f"  {code:15} 会话 {code_sessions[code]:4}  轮 {code_turns[code]:4}  "
            f"{CODE_DESC[code]}  | 意图 {intents}"
        )

    print()
    print("=== 每个病码的例子 ===")
    for code in sorted(examples, key=lambda c: -code_sessions[c]):
        print(f"--- {code} ---")
        for line in examples[code]:
            print("  " + line)

    print()
    print("=== 前置门禁拦截原因 Top 15 ===")
    for reason, n in gate_reasons.most_common(15):
        print(f"  {n:4}  {reason}")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            for item in corpus:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        print()
        print(f"病例已写出 {len(corpus)} 条 → {args.out}")


if __name__ == "__main__":
    main()

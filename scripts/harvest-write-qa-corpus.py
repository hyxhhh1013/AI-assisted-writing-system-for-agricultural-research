#!/usr/bin/env python3
"""线上写节质检语料：最近会话的 write_section / validate_citations 缺陷分布。

在生产机跑：
  sudo -u postgres python3 /tmp/harvest-write-qa-corpus.py
或本机有 psql 时直接 python3 scripts/harvest-write-qa-corpus.py
"""
from __future__ import annotations

import json
import subprocess
from collections import Counter


def psql(sql: str) -> str:
    return subprocess.check_output(
        ["sudo", "-u", "postgres", "psql", "-d", "grainscript", "-tA", "-c", sql],
        text=True,
        stderr=subprocess.STDOUT,
    )


SESSION_LIMIT = 40

SQL = f"""
SELECT COALESCE(
  jsonb_agg(row_to_json(t)),
  '[]'::jsonb
)::text
FROM (
  SELECT
    s.id AS sid,
    o.elem->>'tool' AS tool,
    o.elem->>'success' AS ok,
    o.elem->'data'->>'section' AS section,
    o.elem->'data'->>'blocked' AS blocked,
    (o.elem->'data'->'persisted' IS NOT NULL
      AND o.elem->'data'->'persisted' != 'null'::jsonb) AS persisted,
    o.elem->'data'->'qaReport'->>'verdict' AS verdict,
    o.elem->'data'->'qaReport'->'findings' AS findings,
    left(COALESCE(o.elem->>'summary',''), 160) AS summary
  FROM (
    SELECT id, snapshot, "updatedAt"
    FROM "AgentSession"
    ORDER BY "updatedAt" DESC
    LIMIT {SESSION_LIMIT}
  ) s
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(s.snapshot->'observations', '[]'::jsonb)
  ) AS o(elem)
  WHERE o.elem->>'tool' IN (
    'write_section', 'validate_citations', 'refine_content'
  )
  ORDER BY s."updatedAt" DESC
) t;
"""


def main() -> None:
    raw = psql(SQL).strip()
    rows = json.loads(raw) if raw else []
    if not isinstance(rows, list):
        rows = []

    writes = [r for r in rows if r.get("tool") == "write_section"]
    validates = [r for r in rows if r.get("tool") == "validate_citations"]

    code_all: Counter[str] = Counter()
    code_persisted: Counter[str] = Counter()
    verdicts: Counter[str] = Counter()
    persist_by_verdict: Counter[str] = Counter()
    sessions = set()

    print(f"sessions_scanned={SESSION_LIMIT} write_section={len(writes)} validate={len(validates)}")
    print()
    print("=== write_section 每次 ===")
    for r in writes:
        sessions.add(r.get("sid"))
        verdict = r.get("verdict") or "?"
        persisted = bool(r.get("persisted"))
        blocked = str(r.get("blocked") or "")
        verdicts[verdict] += 1
        persist_by_verdict[f"{verdict}|persist={persisted}"] += 1
        findings = r.get("findings") or []
        codes = []
        if isinstance(findings, list):
            for f in findings:
                if isinstance(f, dict) and f.get("code"):
                    code = str(f["code"])
                    action = str(f.get("action") or "")
                    codes.append(f"{code}:{action}")
                    code_all[code] += 1
                    if persisted:
                        code_persisted[code] += 1
        print(
            f"{str(r.get('sid'))[:12]} {r.get('section')} ok={r.get('ok')} "
            f"verdict={verdict} persist={persisted} blocked={blocked} "
            f"codes={','.join(codes) or '-'} | {r.get('summary') or ''}"
        )

    print()
    print("=== finding code 频次（全部 / 其中已 persist）===")
    for code, n in code_all.most_common():
        print(f"  {code:28} {n:4}  persisted {code_persisted[code]:4}")

    print()
    print("=== verdict × persist ===")
    for k, n in persist_by_verdict.most_common():
        print(f"  {k}: {n}")

    print()
    print("=== validate_citations summaries ===")
    for r in validates[:30]:
        print(f"{str(r.get('sid'))[:12]} ok={r.get('ok')} | {r.get('summary') or ''}")

    leak = [
        (c, code_persisted[c])
        for c in ("cite_semantic_mismatch", "evidence_unbound", "overclaim", "number_not_in_claims")
        if code_persisted[c]
    ]
    print()
    print("=== 事实类已写回（011 应拦住；线上未部署则仍会出现）===")
    if leak:
        for c, n in leak:
            print(f"  LEAK {c} persisted={n}")
    else:
        print("  none in this window")


if __name__ == "__main__":
    main()

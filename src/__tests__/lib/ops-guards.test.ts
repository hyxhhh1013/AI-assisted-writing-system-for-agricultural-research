import { describe, expect, it } from "vitest";
import { classifyOpsSql, wrapOpsReadSql } from "@/lib/ops-sql";
import { externalInterruptBlocksStatusWrite } from "@/lib/agent/external-interrupt";
import { isShanghaiDeepNight } from "@/lib/ops-night-window";
import { redactOpsLogLine, tailText } from "@/lib/ops-logs";
import { startOpsReindex } from "@/lib/ops-reindex";

describe("ops sql and guards", () => {
  it("treats a single select as a read and wraps a row limit", () => {
    expect(classifyOpsSql("SELECT id FROM \"AgentSession\" LIMIT 5")).toBe("read");
    expect(wrapOpsReadSql("SELECT 1")).toContain("LIMIT 200");
    expect(wrapOpsReadSql("EXPLAIN SELECT 1")).toBe("EXPLAIN SELECT 1");
  });

  it("requires confirmation for updates and rejects a second statement", () => {
    expect(classifyOpsSql("UPDATE \"AgentSession\" SET status = 'interrupted' WHERE id = 'a'")).toBe("write");
    expect(classifyOpsSql("SELECT 1; SELECT 2")).toBe("multi");
    expect(classifyOpsSql("DROP DATABASE grainscript")).toBe("forbidden");
    expect(classifyOpsSql("SELECT pg_read_file('/etc/passwd')")).toBe("forbidden");
  });

  it("keeps an external interrupt from being marked completed", () => {
    expect(externalInterruptBlocksStatusWrite("interrupted", "运维 MCP 强制中断", "running")).toBe(true);
    expect(externalInterruptBlocksStatusWrite("interrupted", "运维 MCP 强制中断", "interrupted")).toBe(false);
    expect(externalInterruptBlocksStatusWrite("running", null, "completed")).toBe(false);
  });

  it("opens the reindex window only at night in Shanghai and refuses daytime", () => {
    expect(isShanghaiDeepNight(new Date("2026-10-07T16:30:00.000Z"))).toBe(true);
    expect(isShanghaiDeepNight(new Date("2026-10-07T16:29:00.000Z"))).toBe(false);
    const daytime = startOpsReindex(new Date("2026-10-15T04:00:00.000Z"));
    expect(daytime.started).toBe(false);
    expect(daytime.reason).toContain("00:30");
  });

  it("redacts secrets in log tails", () => {
    const lines = tailText(
      "prefix\nBearer abc.def DATABASE_URL=postgresql://u:p@localhost/db\n",
      5,
    ).map(redactOpsLogLine);
    expect(lines[1]).toContain("Bearer [redacted]");
    expect(lines[1]).not.toContain("u:p");
    expect(redactOpsLogLine("DEEPSEEK_API_KEY=sk-abcdefghij")).toContain("[redacted]");
    expect(redactOpsLogLine("DEEPSEEK_API_KEY=sk-abcdefghij")).not.toContain("sk-abcdefghij");
  });
});

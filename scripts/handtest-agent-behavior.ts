/**
 * 本地手测 P0～P3（真实 LLM + SSE）
 * 用法: npx tsx scripts/handtest-agent-behavior.ts
 */
import { assertAgentScriptTrace } from "../src/lib/eval/agent-scripts";
import type { AgentScriptToolStep } from "../src/contracts/agent-eval-script";

const BASE = process.env.HANDTEST_BASE ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "admin@lab.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "admin123456";

type AgentEvent = {
  type: string;
  sessionId?: string;
  status?: string;
  tool?: string;
  params?: Record<string, unknown>;
  result?: {
    success?: boolean;
    summary?: string;
    error?: string;
    data?: Record<string, unknown>;
  };
  error?: string;
  content?: string;
  checkpoint?: { id: string; kind: string; title?: string; message?: string };
  message?: string;
  preview?: string;
  summary?: { text?: string; toolCallCount?: number };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSetCookie(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = anyHeaders.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]!).join("; ");
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=\s*[^;]+=)/)
    .map((p) => p.trim().split(";")[0]!)
    .filter((p) => p.includes("="))
    .join("; ");
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = parseSetCookie(res);
  if (!res.ok || !cookie) {
    throw new Error(`login failed ${res.status}: ${await res.text()}`);
  }
  return cookie;
}

async function api(cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function createProject(cookie: string, title: string): Promise<string> {
  const res = await api(cookie, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title,
      mode: "research",
      language: "zh",
      citationStyle: "gbt7714",
      outline: "",
      sections: {},
    }),
  });
  const body = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(`create project: ${JSON.stringify(body)}`);
  return body.id;
}

async function getProject(cookie: string, id: string) {
  const res = await api(cookie, `/api/projects?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`get project ${res.status}`);
  return res.json() as Promise<{
    references?: unknown[];
    outline?: string;
    paperPassport?: string;
  }>;
}

async function patchPassportConfig(
  cookie: string,
  projectId: string,
  config: Record<string, string>,
) {
  const res = await api(cookie, `/api/projects/${projectId}/paper-passport`, {
    method: "PATCH",
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error(`passport patch: ${await res.text()}`);
}

async function patchOutline(cookie: string, projectId: string, outline: string) {
  const res = await api(cookie, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      id: projectId,
      title: "handtest-behavior",
      outline,
    }),
  });
  if (!res.ok) throw new Error(`outline save: ${await res.text()}`);
}

async function runAgent(
  cookie: string,
  body: Record<string, unknown>,
  timeoutMs = 240_000,
): Promise<AgentEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const events: AgentEvent[] = [];
  try {
    const res = await fetch(`${BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`agent ${res.status}: ${await res.text()}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:") || t === "data: [DONE]") continue;
        try {
          events.push(JSON.parse(t.slice(5).trim()) as AgentEvent);
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return events;
}

function toToolSteps(events: AgentEvent[]): AgentScriptToolStep[] {
  const steps: AgentScriptToolStep[] = [];
  for (const e of events) {
    if (e.type === "agent/action" && e.tool) {
      steps.push({ tool: e.tool, params: e.params ?? {}, success: true });
    }
    if (e.type === "agent/observation" && e.tool) {
      const last = [...steps].reverse().find((t) => t.tool === e.tool);
      const data =
        e.result?.data && typeof e.result.data === "object"
          ? (e.result.data as Record<string, unknown>)
          : undefined;
      if (last) {
        last.success = e.result?.success !== false && !e.error;
        last.data = data;
      } else {
        steps.push({
          tool: e.tool,
          params: {},
          success: e.result?.success !== false && !e.error,
          data,
        });
      }
    }
  }
  return steps;
}

function summarize(events: AgentEvent[]) {
  const tools = toToolSteps(events);
  let sessionId: string | null = null;
  let checkpoint: AgentEvent["checkpoint"] | null = null;
  let confirm: {
    tool: string;
    params: Record<string, unknown>;
    message?: string;
  } | null = null;
  let finalText = "";
  const errors: string[] = [];
  for (const e of events) {
    if (e.type === "agent/session" && e.sessionId) sessionId = e.sessionId;
    if (e.type === "agent/checkpoint") checkpoint = e.checkpoint ?? null;
    if (e.type === "agent/confirm" && e.tool) {
      confirm = {
        tool: e.tool,
        params: e.params ?? {},
        message: e.message,
      };
    }
    if (e.type === "agent/complete") finalText = e.summary?.text ?? finalText;
    if (e.type === "agent/thought" && e.content) {
      if (!finalText) finalText = e.content;
      else finalText += `\n${e.content}`;
    }
    if (e.type === "agent/error" && e.error) errors.push(e.error);
  }
  return {
    tools,
    sessionId,
    checkpoint,
    confirm,
    finalText,
    errors,
    hadConfirm: Boolean(confirm),
    names: tools.map((t) => t.tool),
  };
}

function pass(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  const report: {
    cases: Record<string, boolean>;
    toolCounts: Record<string, number>;
    avgTools?: string;
  } = { cases: {}, toolCounts: {} };

  console.log(`BASE=${BASE} email=${EMAIL}`);
  const cookie = await login();
  console.log("logged in");

  const projectId = await createProject(cookie, `handtest-behavior-${Date.now()}`);
  console.log("project", projectId);

  // P0
  {
    const events = await runAgent(cookie, {
      goal: "看看项目现在卡在哪，建议下一步",
      projectId,
      mode: "auto",
    });
    const s = summarize(events);
    const ok =
      s.checkpoint?.kind === "config_confirm"
      && !s.names.includes("write_section");
    report.cases.P0 = ok;
    report.toolCounts.P0 = s.tools.length;
    pass(
      "P0 config_confirm",
      ok,
      `checkpoint=${s.checkpoint?.kind ?? "none"} tools=${s.tools.length}`,
    );

    await patchPassportConfig(cookie, projectId, {
      paperTitle: "生物炭对土壤肥力影响的研究进展",
      paperType: "review",
      language: "zh",
      citationStyle: "gbt7714",
      wordCount: "8000-12000",
      targetJournal: "手测期刊",
    });

    if (s.sessionId && s.checkpoint) {
      const resume = await runAgent(
        cookie,
        {
          sessionId: s.sessionId,
          resume: true,
          projectId,
          mode: "auto",
          checkpointDecision: {
            checkpointId: s.checkpoint.id,
            decision: "approve",
            note: "配置已填写",
          },
        },
        300_000,
      );
      const rs = summarize(resume);
      const p0b = !rs.errors.some((e) => /过期|未授权/.test(e));
      pass("P0 approve after config", p0b, `tools=${rs.tools.length}`);
      report.toolCounts.P0b = rs.tools.length;
      report.cases.P0 = report.cases.P0 && p0b;
    }
  }

  await sleep(800);

  // P1
  {
    const goal = "看看项目现在卡在哪，建议下一步";
    const events = await runAgent(
      cookie,
      { goal, projectId, mode: "auto" },
      300_000,
    );
    const s = summarize(events);
    const fails = assertAgentScriptTrace({
      scriptId: "P1",
      goals: [goal],
      tools: s.tools,
      finalText: s.finalText,
    });
    const ok = fails.length === 0 && s.errors.length === 0;
    report.cases.P1 = ok;
    report.toolCounts.P1 = s.tools.length;
    pass(
      "P1 diagnose",
      ok,
      `tools=${s.names.join(">") || "(none)"} fails=${fails.map((f) => f.code).join(",") || "none"}`,
    );
    if (!ok) {
      console.log("  text:", s.finalText.slice(0, 300));
      console.log("  fails:", fails);
      console.log("  errors:", s.errors);
    }
  }

  await sleep(800);

  // P2
  {
    const goal = "检索并导入 1 篇与「生物炭改良土壤」相关的文献";
    const before = await getProject(cookie, projectId);
    const refBefore = Array.isArray(before.references) ? before.references.length : 0;

    let events = await runAgent(
      cookie,
      { goal, projectId, mode: "auto" },
      360_000,
    );
    let s = summarize(events);

    if (s.confirm?.tool === "import_reference" && s.sessionId) {
      const resume = await runAgent(
        cookie,
        {
          sessionId: s.sessionId,
          resume: true,
          projectId,
          mode: "auto",
          confirmDecision: {
            tool: s.confirm.tool,
            params: s.confirm.params,
            approved: true,
          },
        },
        360_000,
      );
      events = [...events, ...resume];
      s = summarize(events);
    }

    const after = await getProject(cookie, projectId);
    const refAfter = Array.isArray(after.references) ? after.references.length : 0;

    const fails = assertAgentScriptTrace({
      scriptId: "P2",
      goals: [goal],
      tools: s.tools,
      finalText: s.finalText,
      hadConfirm: s.hadConfirm,
      referenceCountBefore: refBefore,
      referenceCountAfter: refAfter,
    });

    const ok = fails.length === 0 && refAfter > refBefore;
    report.cases.P2 = ok;
    report.toolCounts.P2 = s.tools.length;
    pass(
      "P2 literature import",
      ok,
      `refs ${refBefore}→${refAfter} confirm=${s.hadConfirm} tools=${s.names.join(">") || "(none)"} fails=${fails.map((f) => f.code).join(",") || "none"}`,
    );
    if (!ok) {
      console.log("  fails:", fails);
      console.log("  errors:", s.errors);
    }
  }

  await sleep(800);

  // P3（同项目：已有文献；补大纲；验证诊断污染修复后写引言不先乱搜）
  {
    await patchOutline(
      cookie,
      projectId,
      "# 大纲\n## 1 引言\n## 2 研究进展\n## 3 结论\n",
    );
    // 若 P2 未导入成功，再补一条参考文献
    const proj = await getProject(cookie, projectId);
    if (!Array.isArray(proj.references) || proj.references.length === 0) {
      const refRes = await api(cookie, `/api/projects/${projectId}/references`, {
        method: "PATCH",
        body: JSON.stringify({
          ops: [
            {
              op: "create",
              content:
                "Lehmann J, et al. Biochar effects on soil biota – A review. Soil Biology and Biochemistry, 2011, 43: 1812-1836.",
            },
          ],
        }),
      });
      if (!refRes.ok) {
        console.log("seed ref failed", await refRes.text());
      }
    }
    const goal = "写引言";
    const events = await runAgent(
      cookie,
      { goal, projectId, mode: "auto" },
      420_000,
    );
    const s = summarize(events);
    const fails = assertAgentScriptTrace({
      scriptId: "P3",
      goals: [goal],
      tools: s.tools,
      finalText: s.finalText,
    });
    const ok = fails.length === 0;
    report.cases.P3 = ok;
    report.toolCounts.P3 = s.tools.length;
    pass(
      "P3 read-before-write intro",
      ok,
      `tools=${s.names.join(">") || "(none)"} fails=${fails.map((f) => f.code).join(",") || "none"}`,
    );
    if (!ok) {
      console.log("  text:", s.finalText.slice(0, 300));
      console.log("  fails:", fails);
      console.log("  errors:", s.errors);
    }
  }

  const counts = Object.values(report.toolCounts);
  report.avgTools =
    counts.length > 0
      ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)
      : "n/a";

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report, null, 2));
  const allOk = ["P0", "P1", "P2", "P3"].every((k) => report.cases[k]);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});

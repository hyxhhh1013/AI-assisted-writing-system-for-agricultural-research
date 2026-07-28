/**
 * 复测失败项：P1（全新项目）、P3（有大纲+文献）
 */
import { assertAgentScriptTrace } from "../src/lib/eval/agent-scripts";

const BASE = process.env.HANDTEST_BASE ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "admin@lab.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "admin123456";

type Ev = {
  type: string;
  tool?: string;
  params?: Record<string, unknown>;
  result?: { success?: boolean; data?: Record<string, unknown>; error?: string; summary?: string };
  error?: string;
  content?: string;
  summary?: { text?: string };
  sessionId?: string;
  checkpoint?: { id: string; kind: string };
};

function cookies(res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]!).join("; ");
  return (res.headers.get("set-cookie") || "").split(";")[0] || "";
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const c = cookies(res);
  if (!res.ok || !c) throw new Error(`login ${res.status}`);
  return c;
}

async function api(cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers as Record<string, string>),
    },
  });
}

async function runAgent(cookie: string, body: Record<string, unknown>, ms = 360000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const events: Ev[] = [];
  try {
    const res = await fetch(`${BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`agent ${res.status} ${await res.text()}`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const x = line.trim();
        if (!x.startsWith("data:") || x === "data: [DONE]") continue;
        try {
          events.push(JSON.parse(x.slice(5).trim()) as Ev);
        } catch {
          /* */
        }
      }
    }
  } finally {
    clearTimeout(t);
  }
  return events;
}

function toolsFrom(events: Ev[]) {
  const tools: {
    tool: string;
    params?: Record<string, unknown>;
    success?: boolean;
    data?: Record<string, unknown>;
  }[] = [];
  for (const e of events) {
    if (e.type === "agent/action" && e.tool) {
      tools.push({ tool: e.tool, params: e.params, success: true });
    }
    if (e.type === "agent/observation" && e.tool) {
      const last = [...tools].reverse().find((t) => t.tool === e.tool);
      if (last) {
        last.success = e.result?.success !== false && !e.error;
        last.data = e.result?.data;
      } else {
        tools.push({
          tool: e.tool,
          success: e.result?.success !== false && !e.error,
          data: e.result?.data,
        });
      }
    }
  }
  return tools;
}

function finalText(events: Ev[]) {
  let t = "";
  for (const e of events) {
    if (e.type === "agent/complete") t = e.summary?.text || t;
    if (e.type === "agent/thought" && e.content) t += `\n${e.content}`;
  }
  return t;
}

async function main() {
  const cookie = await login();

  // —— P1 fresh ——
  {
    const created = await api(cookie, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: `handtest-p1-${Date.now()}`,
        mode: "research",
        language: "zh",
        citationStyle: "gbt7714",
        outline: "",
        sections: {},
      }),
    });
    const { id } = (await created.json()) as { id: string };
    await api(cookie, `/api/projects/${id}/paper-passport`, {
      method: "PATCH",
      body: JSON.stringify({
        config: {
          paperTitle: "生物炭对土壤肥力的影响",
          paperType: "review",
          language: "zh",
          citationStyle: "gbt7714",
          wordCount: "8000-12000",
          targetJournal: "",
        },
      }),
    });
    const goal = "看看项目现在卡在哪，建议下一步";
    const events = await runAgent(cookie, { goal, projectId: id, mode: "auto" });
    const tools = toolsFrom(events);
    const fails = assertAgentScriptTrace({
      scriptId: "P1",
      goals: [goal],
      tools,
      finalText: finalText(events),
    });
    console.log(
      "P1",
      fails.length === 0 ? "PASS" : "FAIL",
      tools.map((t) => t.tool).join(">"),
      fails,
    );
    console.log("P1 text:", finalText(events).slice(0, 400));
  }

  // —— P3 on project with outline + 1 ref ——
  {
    const created = await api(cookie, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: `handtest-p3-${Date.now()}`,
        mode: "research",
        language: "zh",
        citationStyle: "gbt7714",
        outline: "# 大纲\n## 1 引言\n## 2 正文\n## 3 结论\n",
        sections: {},
      }),
    });
    const { id } = (await created.json()) as { id: string };
    await api(cookie, `/api/projects/${id}/paper-passport`, {
      method: "PATCH",
      body: JSON.stringify({
        config: {
          paperTitle: "生物炭改良土壤综述",
          paperType: "review",
          language: "zh",
          citationStyle: "gbt7714",
          wordCount: "8000-12000",
          targetJournal: "",
        },
      }),
    });

    // seed one reference via agent P2 quickly or skip if write needs refs
    const lit = await runAgent(
      cookie,
      {
        goal: "检索并导入 1 篇与「生物炭改良土壤」相关的文献",
        projectId: id,
        mode: "auto",
      },
      360000,
    );
    let sessionId: string | undefined;
    let confirm: { tool: string; params: Record<string, unknown> } | null = null;
    for (const e of lit) {
      if (e.type === "agent/session" && e.sessionId) sessionId = e.sessionId;
      if (e.type === "agent/confirm" && e.tool) {
        confirm = { tool: e.tool, params: e.params || {} };
      }
    }
    if (confirm && sessionId) {
      await runAgent(cookie, {
        sessionId,
        resume: true,
        projectId: id,
        mode: "auto",
        confirmDecision: { ...confirm, approved: true },
      });
    }

    const goal = "写引言";
    const events = await runAgent(cookie, { goal, projectId: id, mode: "auto" }, 420000);
    const tools = toolsFrom(events);
    const writeObs = events.filter(
      (e) => e.type === "agent/observation" && e.tool === "write_section",
    );
    console.log(
      "P3 write observations:",
      JSON.stringify(
        writeObs.map((e) => ({
          success: e.result?.success,
          error: e.error || e.result?.error,
          data: e.result?.data,
          summary: e.result?.summary,
          params: events.find(
            (a) => a.type === "agent/action" && a.tool === "write_section",
          )?.params,
        })),
        null,
        2,
      ),
    );
    const fails = assertAgentScriptTrace({
      scriptId: "P3",
      goals: [goal],
      tools,
      finalText: finalText(events),
    });
    console.log(
      "P3",
      fails.length === 0 ? "PASS" : "FAIL",
      tools.map((t) => t.tool).join(">"),
      fails,
    );
    console.log("P3 text:", finalText(events).slice(0, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

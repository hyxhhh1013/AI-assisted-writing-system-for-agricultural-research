/**
 * P3 复测：API 预置大纲+文献，再让 Agent「写引言」
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

async function runAgent(cookie: string, body: Record<string, unknown>, ms = 420000) {
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
      const last = [...tools].reverse().find((x) => x.tool === e.tool);
      if (last) {
        last.success = e.result?.success !== false && !e.error;
        last.data = e.result?.data;
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
  const created = await api(cookie, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: `handtest-p3b-${Date.now()}`,
      mode: "research",
      language: "zh",
      citationStyle: "gbt7714",
      outline:
        "# 大纲\n## 1 引言\n背景与意义；生物炭概念；本文结构\n## 2 研究进展\n## 3 结论\n",
      sections: {},
    }),
  });
  const { id } = (await created.json()) as { id: string };
  console.log("project", id);

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

  const refRes = await api(cookie, `/api/projects/${id}/references`, {
    method: "PATCH",
    body: JSON.stringify({
      ops: [
        {
          op: "upsert",
          reference: {
            id: `ref-handtest-${Date.now()}`,
            citation:
              "Lehmann J, et al. Biochar effects on soil biota – A review. Soil Biology and Biochemistry, 2011.",
            title: "Biochar effects on soil biota – A review",
            authors: "Lehmann J",
            year: 2011,
            doi: "10.1016/j.soilbio.2011.04.022",
          },
        },
      ],
    }),
  });
  console.log("seed refs", refRes.status, (await refRes.text()).slice(0, 200));

  const goal =
    "项目已有大纲和参考文献。请先读大纲/文献列表，再 write_section 写引言（section=introduction），不要再检索新文献。";
  const events = await runAgent(cookie, { goal, projectId: id, mode: "auto" });
  const tools = toolsFrom(events);
  const writeObs = events.filter(
    (e) => e.type === "agent/observation" && e.tool === "write_section",
  );
  console.log(
    "write obs",
    JSON.stringify(
      writeObs.map((e) => ({
        success: e.result?.success,
        error: e.error || e.result?.error,
        data: e.result?.data,
        summary: e.result?.summary,
      })),
      null,
      2,
    ),
  );
  console.log("tools", tools.map((t) => t.tool).join(">"));
  const fails = assertAgentScriptTrace({
    scriptId: "P3",
    goals: ["写引言"],
    tools,
    finalText: finalText(events),
  });
  console.log(fails.length === 0 ? "P3 PASS" : "P3 FAIL", fails);
  console.log("text:", finalText(events).slice(0, 500));
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

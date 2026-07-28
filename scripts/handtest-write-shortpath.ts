/**
 * 验证写引言短路径：有大纲+文献、无蓝图时，直接「写引言」应自动补蓝图并写回。
 * 用法: npx tsx scripts/handtest-write-shortpath.ts
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
  content?: string;
  summary?: { text?: string };
  error?: string;
};

function cookies(res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]!).join("; ");
  return (res.headers.get("set-cookie") || "").split(";")[0] || "";
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = cookies(login);
  if (!login.ok) throw new Error("login failed");

  const created = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: `shortpath-${Date.now()}`,
      mode: "research",
      language: "zh",
      citationStyle: "gbt7714",
      outline:
        "# 大纲\n## 1 引言\n背景、意义与综述范围\n## 2 研究进展\n国内外现状\n## 3 结论与展望\n",
      sections: {},
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await fetch(`${BASE}/api/projects/${id}/paper-passport`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
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
  await fetch(`${BASE}/api/projects/${id}/references`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      ops: [
        {
          op: "create",
          content:
            "Lehmann J, et al. Biochar effects on soil biota – A review. Soil Biology and Biochemistry, 2011.",
        },
      ],
    }),
  });

  console.log("project", id, "(有大纲+文献，无蓝图)");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 420_000);
  const events: Ev[] = [];
  try {
    const res = await fetch(`${BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ goal: "写引言", projectId: id, mode: "auto" }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(await res.text());
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
    clearTimeout(timer);
  }

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
      }
    }
  }

  const autoPrereq = events.filter(
    (e) =>
      e.type === "agent/action"
      && (e.tool === "generate_writing_blueprint"
        || e.tool === "build_argument_blueprint"
        || e.tool === "generate_outline")
      && e.params?.autoPrereq === true,
  );
  const names = tools.map((t) => t.tool);
  let text = "";
  for (const e of events) {
    if (e.type === "agent/complete") text = e.summary?.text || text;
    if (e.type === "agent/thought" && e.content) text += `\n${e.content}`;
  }

  const fails = assertAgentScriptTrace({
    scriptId: "P3",
    goals: ["写引言"],
    tools,
    finalText: text,
  });

  console.log("tools:", names.join(">") || "(none)");
  console.log("autoPrereq steps:", autoPrereq.map((e) => e.tool).join(" → ") || "(none)");
  console.log("toolCount:", names.length);
  console.log(fails.length === 0 ? "P3 PASS" : "P3 FAIL", fails);

  // 短路径期望：总工具数显著低于旧版 ~11（允许读上下文 + 自动蓝图 + 写）
  const shortEnough = names.length <= 8;
  console.log(shortEnough ? "SHORTPATH OK" : "SHORTPATH LONG", `(${names.length} <= 8?)`);
  process.exit(fails.length === 0 && shortEnough ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

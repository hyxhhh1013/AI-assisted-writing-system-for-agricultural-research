/**
 * 禾书耕文线上运维 MCP。
 * 配置：本机 %USERPROFILE%\.grainscript\ops.env
 *   OPS_MCP_TOKEN=与服务器 .env 相同，至少 24 位
 *   OPS_BASE_URL=https://ai4science.hyxhhh.site
 * 读操作走 GET。写操作（中断会话、SQL、重切）必须 confirm。
 * 不提供 shell。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const PROTOCOL = "2024-11-05";
const DEFAULT_BASE = "https://ai4science.hyxhhh.site";

function loadLocalEnv() {
  const file = path.join(os.homedir(), ".grainscript", "ops.env");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const tools = [
  {
    name: "prod_health",
    description: "查询线上健康：数据库、PM2、堆内存、AI 密钥是否在位（只返回数量）、会话报错数。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    path: "/api/ops/health",
  },
  {
    name: "prod_stats",
    description: "查询线上计数：用户、项目、文献、查重、审查、方向、会话状态。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    path: "/api/ops/stats",
  },
  {
    name: "prod_sessions",
    description: "列出最近的线上 Agent 会话。可按 status、q（目标或会话 id）、intentKind 筛选。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "running | interrupted | completed | error" },
        q: { type: "string", description: "目标关键词或会话 id" },
        intentKind: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    path: "/api/ops/sessions",
  },
  {
    name: "prod_session",
    description: "读取一个线上会话的截断对话尾部和工具轨迹。不含章节正文。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    path: "/api/ops/sessions",
  },
  {
    name: "prod_loop_scan",
    description: "统计最近线上会话的空转病码（连搜、来回调用、门禁回弹、卡住的 running）。",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 40 },
        days: { type: "integer", minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
    path: "/api/ops/loop-scan",
  },
  {
    name: "prod_logs",
    description: "读取线上固定日志的尾部。source 为 app（PM2）、deploy（部署日志）或 reindex（重切日志）。会抹掉密钥和连接串。",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["app", "deploy", "reindex"] },
        lines: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["source"],
      additionalProperties: false,
    },
    path: "/api/ops/logs",
  },
  {
    name: "prod_sql",
    description: "在线上数据库执行一条 SQL。SELECT/WITH/EXPLAIN 可直接查，最多 200 行。INSERT/UPDATE/DELETE 等写语句必须 confirm 为 true。禁止多语句、DROP DATABASE、读服务器文件和改角色。",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        confirm: { type: "boolean", description: "写语句必须为 true，且只有用户明确要求改数据时才设" },
      },
      required: ["sql"],
      additionalProperties: false,
    },
    method: "POST",
    path: "/api/ops/sql",
  },
  {
    name: "prod_reindex",
    description: "在北京时间 00:30–05:00 启动全库重切（--rechunk）。必须 confirm 为 true。窗外不会启动。日志用 prod_logs source=reindex 看。",
    inputSchema: {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "用户明确要求重切时才为 true" },
      },
      required: ["confirm"],
      additionalProperties: false,
    },
    method: "POST",
    path: "/api/ops/reindex",
  },
  {
    name: "prod_interrupt_session",
    description: "把一个仍在 running 的线上会话标为 interrupted。只有用户明确要求中断这个会话时才把 confirm 设为 true。不删除会话，不改论文正文。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        confirm: { type: "boolean", description: "用户明确要求中断时才为 true" },
      },
      required: ["id", "confirm"],
      additionalProperties: false,
    },
    method: "POST",
    path: "/api/ops/sessions",
  },
];

function baseUrl() {
  return (process.env.OPS_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function toolUrl(tool, args) {
  const url = new URL(tool.path, baseUrl());
  if (tool.name === "prod_session" || tool.name === "prod_interrupt_session") {
    url.pathname = `${tool.path}/${encodeURIComponent(String(args.id || ""))}`;
    return url;
  }
  if (tool.name === "prod_logs") {
    if (args.source) url.searchParams.set("source", String(args.source));
    if (args.lines) url.searchParams.set("lines", String(args.lines));
    return url;
  }
  for (const key of ["status", "q", "intentKind", "limit", "days"]) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function callOps(tool, args) {
  const token = process.env.OPS_MCP_TOKEN?.trim() || "";
  if (token.length < 24) {
    return {
      isError: true,
      text: "未配置 OPS_MCP_TOKEN。把与服务器相同的令牌写到本机 ~/.grainscript/ops.env 后重载 MCP。",
    };
  }
  if ((tool.name === "prod_session" || tool.name === "prod_interrupt_session") && !args.id) {
    return { isError: true, text: `${tool.name} 需要 id` };
  }
  if (tool.name === "prod_interrupt_session" && args.confirm !== true) {
    return { isError: true, text: "未确认。只有用户明确要求中断这个会话时，才把 confirm 设为 true。" };
  }
  if (tool.name === "prod_reindex" && args.confirm !== true) {
    return { isError: true, text: "未确认。只有用户明确要求重切索引时，才把 confirm 设为 true。" };
  }
  if (tool.name === "prod_sql" && !args.sql) {
    return { isError: true, text: "prod_sql 需要 sql" };
  }
  const url = toolUrl(tool, args || {});
  const method = tool.method || "GET";
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let body;
  if (tool.name === "prod_interrupt_session") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ action: "interrupt", confirm: true });
  } else if (tool.name === "prod_reindex") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ confirm: true });
  } else if (tool.name === "prod_sql") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ sql: args.sql, confirm: args.confirm === true });
  }
  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const payload = text.length > 60_000 ? `${text.slice(0, 60_000)}\n…(truncated)` : text;
  return { isError: !res.ok, text: payload || res.statusText };
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "grainscript-ops", version: "0.1.0" },
      },
    });
    return;
  }

  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      },
    });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const tool = tools.find((item) => item.name === name);
    if (!tool) {
      send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: `未知工具 ${name}` }], isError: true },
      });
      return;
    }
    callOps(tool, params?.arguments || {})
      .then((result) => {
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: result.text }], isError: result.isError },
        });
      })
      .catch((err) => {
        const text = err instanceof Error ? err.message : "请求失败";
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text }], isError: true },
        });
      });
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `未实现的方法 ${method}` },
  });
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    handle(JSON.parse(trimmed));
  } catch {
    /* 忽略无法解析的行 */
  }
});

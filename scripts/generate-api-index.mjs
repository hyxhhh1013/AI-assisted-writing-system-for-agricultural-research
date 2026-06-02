#!/usr/bin/env node
/**
 * Scan src/app/api route handlers and regenerate docs/API_INDEX.md (auto section).
 *
 * Usage: node scripts/generate-api-index.mjs
 *        npm run docs:api-index
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API_ROOT = path.join(ROOT, "src", "app", "api");
const OUT_FILE = path.join(ROOT, "docs", "API_INDEX.md");

const METHOD_RE = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/** @type {Record<string, string>} */
const GROUP_LABELS = {
  auth: "认证",
  projects: "项目",
  writing: "AI 写作",
  outline: "大纲",
  chat: "文献对话",
  knowledge: "知识库",
  consistency: "一致性",
  analysis: "分析",
  data: "数据分析",
  review: "审查",
  plagiarism: "查重",
  references: "参考文献工具",
  translate: "翻译",
  figures: "图表注册表",
  chart: "图表生成",
  table: "三线表",
  xrd: "XRD",
  "flow-diagram": "流程图",
  "mol-diagram": "分子图",
  export: "导出",
  pdf: "PDF",
  "save-chart": "保存图表",
  charts: "静态图表文件",
  admin: "Admin（需 requireAdmin）",
  other: "其他",
};

const GROUP_ORDER = [
  "auth",
  "projects",
  "writing",
  "outline",
  "chat",
  "knowledge",
  "consistency",
  "analysis",
  "data",
  "review",
  "plagiarism",
  "references",
  "translate",
  "figures",
  "chart",
  "table",
  "xrd",
  "flow-diagram",
  "mol-diagram",
  "export",
  "pdf",
  "save-chart",
  "charts",
  "admin",
  "other",
];

function walkRoutes(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkRoutes(full, acc);
    else if (name === "route.ts") acc.push(full);
  }
  return acc;
}

/** @param {string} file */
function apiPathFromFile(file) {
  const rel = path.relative(API_ROOT, file).replace(/\\/g, "/");
  const segments = rel.split("/");
  segments.pop();
  return `/api/${segments.join("/")}`;
}

/** @param {string} apiPath */
function groupKey(apiPath) {
  const rest = apiPath.replace(/^\/api\/?/, "");
  if (!rest) return "other";
  if (rest.startsWith("admin/")) return "admin";
  const first = rest.split("/")[0];
  if (GROUP_LABELS[first]) return first;
  return "other";
}

/** @param {string} content */
function analyzeRoute(content) {
  const methods = [];
  let m;
  while ((m = METHOD_RE.exec(content)) !== null) methods.push(m[1]);
  const zod = /\bvalidateBody\s*\(/.test(content);
  const sse =
    /text\/event-stream/.test(content) &&
    (/ReadableStream/.test(content) || /controller\.enqueue/.test(content));
  const admin = /\brequireAdmin\s*\(/.test(content);
  return { methods: [...new Set(methods)], zod, sse, admin };
}

/** @param {boolean} v */
function mark(v) {
  return v ? "✓" : "—";
}

/** @param {Array<{ apiPath: string, methods: string[], zod: boolean, sse: boolean, admin: boolean }>} routes */
function renderTables(routes) {
  /** @type {Map<string, typeof routes>} */
  const byGroup = new Map();
  for (const r of routes) {
    const g = groupKey(r.apiPath);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }

  const lines = [];
  for (const g of GROUP_ORDER) {
    const list = byGroup.get(g);
    if (!list?.length) continue;
    list.sort((a, b) => a.apiPath.localeCompare(b.apiPath));
    lines.push(`### ${GROUP_LABELS[g] ?? g}`, "");
    lines.push("| 方法 | 路径 | zod | SSE | admin |", "|------|------|-----|-----|-------|");
    for (const r of list) {
      lines.push(
        `| ${r.methods.join(", ") || "—"} | \`${r.apiPath}\` | ${mark(r.zod)} | ${mark(r.sse)} | ${mark(r.admin)} |`,
      );
    }
    lines.push("");
    byGroup.delete(g);
  }
  for (const [g, list] of byGroup) {
    list.sort((a, b) => a.apiPath.localeCompare(b.apiPath));
    lines.push(`### ${g}`, "");
    lines.push("| 方法 | 路径 | zod | SSE | admin |", "|------|------|-----|-----|-------|");
    for (const r of list) {
      lines.push(
        `| ${r.methods.join(", ") || "—"} | \`${r.apiPath}\` | ${mark(r.zod)} | ${mark(r.sse)} | ${mark(r.admin)} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildAutoSection() {
  const files = walkRoutes(API_ROOT);
  const routes = files.map((file) => {
    const content = fs.readFileSync(file, "utf8");
    const { methods, zod, sse, admin } = analyzeRoute(content);
    return { apiPath: apiPathFromFile(file), methods, zod, sse, admin };
  });
  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const stats = {
    routes: routes.length,
    zod: routes.filter((r) => r.zod).length,
    sse: routes.filter((r) => r.sse).length,
    admin: routes.filter((r) => r.admin).length,
  };
  const meta =
    "> 由 `npm run docs:api-index` 扫描 `src/app/api` 下全部 `route.ts` 生成。" +
    ` 更新时间：**${generatedAt}**（共 **${stats.routes}** 个 route 文件，` +
    `validateBody **${stats.zod}**，SSE **${stats.sse}**，requireAdmin **${stats.admin}**）。`;
  return [
    "## 路由表（自动生成）",
    "",
    meta,
    "",
    "图例：zod = 使用 validateBody；SSE = 含 text/event-stream / ReadableStream；admin = 含 requireAdmin。",
    "",
    renderTables(routes).trimEnd(),
  ].join("\n");
}

const HEADER = `# API 路由索引（L4）

> 路径均相对于站点根。人工说明见下文；**路由表由脚本自动维护**。

## 使用说明

- 新增或修改 Route Handler 后执行：\`npm run docs:api-index\`
- 写操作应接入 \`validateBody\` + \`@/lib/validations\`（见工程队列 ENG-PR-023/024）
- Admin 路由必须在 handler 开头 \`requireAdmin()\`
- 流式接口事件形状：写作见 \`src/contracts/sse.ts\`；查重 v2 进度为独立 JSON 事件

`;

const MANUAL = `## 人工备注（不随脚本覆盖）

### 写作 SSE 事件类型

见 [\`domain/writing-pipeline.md\`](./domain/writing-pipeline.md) 与 \`src/contracts/sse.ts\`。

### 查重 v2 SSE

\`Accept: text/event-stream\` 时事件：\`progress\` | \`done\` | \`error\`（非 WritingSSE 联合类型）。

### 尚未接入 validateBody 的常见路由

脚本标记为「—」的条目，改接口时请优先补 zod schema。典型：部分 \`chart\` / \`xrd\` / \`export\` / 只读 GET。

### Admin 分组

凡路径以 \`/api/admin\` 开头均需管理员；列表见自动生成表中 admin=✓ 的行。

`;

const START = "<!-- API_INDEX:AUTO:START -->";
const END = "<!-- API_INDEX:AUTO:END -->";

function main() {
  const auto = buildAutoSection();
  let existing = "";
  if (fs.existsSync(OUT_FILE)) {
    existing = fs.readFileSync(OUT_FILE, "utf8");
  }

  const autoBlock = `${START}\n${auto}\n${END}`;
  let out;
  if (existing.includes(START) && existing.includes(END)) {
    out = existing.replace(
      new RegExp(`${START}[\\s\\S]*${END}`),
      autoBlock,
    );
  } else {
    out = HEADER + "\n" + autoBlock + "\n\n" + MANUAL;
  }

  fs.writeFileSync(OUT_FILE, out, "utf8");
  const count = walkRoutes(API_ROOT).length;
  console.log(`Wrote ${OUT_FILE} (${count} route files)`);
}

main();

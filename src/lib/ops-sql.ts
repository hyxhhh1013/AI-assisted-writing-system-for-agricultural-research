/**
 * 运维 SQL 分类。只执行一条语句。读语句不需要 confirm；其余需要。
 * DROP DATABASE / DROP SCHEMA、读服务器文件、改角色权限一律拒绝。
 */

const FORBIDDEN = [
  /\bdrop\s+database\b/i,
  /\bdrop\s+schema\b/i,
  /\bpg_read_file\b/i,
  /\bpg_read_binary_file\b/i,
  /\bpg_ls_dir\b/i,
  /\blo_import\b/i,
  /\blo_export\b/i,
  /\bcopy\b[\s\S]*\bprogram\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bcreate\s+role\b/i,
  /\balter\s+role\b/i,
  /\bcreate\s+user\b/i,
  /\balter\s+user\b/i,
];

const READ_KEYWORDS = new Set(["select", "with", "explain", "values"]);

export type OpsSqlKind = "read" | "write" | "empty" | "multi" | "forbidden";

function statementCount(sql: string): number {
  let count = 0;
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const char of sql) {
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) count += 1;
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) count += 1;
  return count;
}

function leadingKeyword(sql: string): string {
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  const withoutLine = withoutBlock.replace(/--[^\n]*/g, " ");
  const match = withoutLine.trim().match(/^([a-zA-Z]+)/);
  return (match?.[1] ?? "").toLowerCase();
}

export function classifyOpsSql(sql: string): OpsSqlKind {
  const trimmed = sql.trim();
  if (!trimmed) return "empty";
  if (FORBIDDEN.some((pattern) => pattern.test(trimmed))) return "forbidden";
  if (statementCount(trimmed) !== 1) return "multi";
  return READ_KEYWORDS.has(leadingKeyword(trimmed)) ? "read" : "write";
}

export function wrapOpsReadSql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (leadingKeyword(trimmed) === "explain") return trimmed;
  return `SELECT * FROM (${trimmed}) AS ops_rows LIMIT 200`;
}

export function jsonSafeSqlValue(value: unknown, depth = 0): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 4) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => jsonSafeSqlValue(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      out[key] = jsonSafeSqlValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

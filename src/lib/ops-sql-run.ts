import prisma from "@/lib/prisma";
import { classifyOpsSql, jsonSafeSqlValue, wrapOpsReadSql } from "@/lib/ops-sql";

export class OpsSqlRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsSqlRejected";
  }
}

export async function runOpsSql(sql: string): Promise<
  | { kind: "read"; rowCount: number; rows: unknown[] }
  | { kind: "write"; rowCount: number }
> {
  const kind = classifyOpsSql(sql);
  if (kind === "empty") throw new OpsSqlRejected("SQL 为空");
  if (kind === "multi") throw new OpsSqlRejected("只执行一条语句");
  if (kind === "forbidden") throw new OpsSqlRejected("这条语句不在运维 SQL 允许范围内");

  const statement = sql.trim().replace(/;+\s*$/, "");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '8s'");
    if (kind === "read") {
      const rows = await tx.$queryRawUnsafe(wrapOpsReadSql(statement));
      const list = Array.isArray(rows) ? rows : [];
      return {
        kind: "read" as const,
        rowCount: list.length,
        rows: list.slice(0, 200).map((row) => jsonSafeSqlValue(row)),
      };
    }
    const rowCount = await tx.$executeRawUnsafe(statement);
    return { kind: "write" as const, rowCount };
  }, { maxWait: 5_000, timeout: 20_000 });
}

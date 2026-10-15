import path from "path";
import fs from "fs";
import prisma from "@/lib/prisma";
import { getAllKeys, resolveProviderModel } from "@/lib/ai";
import { collectProcessHealth } from "@/lib/admin-process-health";
import { intentKindFromSnapshot, lastFailFromSnapshot } from "@/lib/admin-session-fail";
import { isAgentSessionSnapshot } from "@/contracts/agent-session";
import { isIntentKind } from "@/contracts/agent-intent";
import type { OpsHealth, OpsLoopScan, OpsSessionList, OpsStats } from "@/contracts/ops";
import { MODEL_PROVIDERS, type ModelProviderKey } from "@/lib/models";
import { classifyLoopSessions, codeLabel, type LoopScanInput, type LoopUiMessage } from "@/lib/ops-loop-scan";
import { OPS_INTERRUPT_MESSAGE } from "@/lib/agent/external-interrupt";
import { viewOpsSession, type OpsSessionSource } from "@/lib/ops-session-view";
import type { OpsSessionDetail } from "@/contracts/ops";

const SESSION_STATUSES = new Set(["running", "interrupted", "completed", "error"]);

function clip(value: string | null | undefined, cap: number): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > cap ? `${trimmed.slice(0, cap)}…` : trimmed;
}

function asCount(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

async function readDbSizeBytes(provider: string): Promise<number> {
  if (provider !== "PostgreSQL") return 0;
  try {
    const rows = await prisma.$queryRaw<Array<{ size: bigint | number }>>`
      SELECT pg_database_size(current_database()) AS size
    `;
    return asCount(rows[0]?.size);
  } catch {
    return 0;
  }
}

function readIndexFootprint(): { fileCount: number; totalSizeBytes: number } {
  const dataDir = path.join(process.cwd(), "data");
  try {
    if (!fs.existsSync(dataDir)) return { fileCount: 0, totalSizeBytes: 0 };
    const names = fs.readdirSync(dataDir).filter((name) => name.startsWith("index"));
    let totalSizeBytes = 0;
    for (const name of names) {
      try {
        totalSizeBytes += fs.statSync(path.join(dataDir, name)).size;
      } catch {
        /* skip one file */
      }
    }
    return { fileCount: names.length, totalSizeBytes };
  } catch {
    return { fileCount: 0, totalSizeBytes: 0 };
  }
}

export async function loadOpsHealth(): Promise<OpsHealth> {
  let dbConnected = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbConnected = false;
  }
  const dbUrl = process.env.DATABASE_URL || "";
  const provider = dbUrl.startsWith("postgres")
    ? "PostgreSQL"
    : dbUrl.startsWith("file:")
      ? "SQLite"
      : "unknown";

  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [fileCount, chunkCount, agentTotal, agentError, agentError24h, agentRunning, processHealth, sizeBytes] =
    await Promise.all([
      prisma.knowledgeFile.count(),
      prisma.knowledgeChunk.count(),
      prisma.agentSession.count(),
      prisma.agentSession.count({ where: { status: "error" } }),
      prisma.agentSession.count({ where: { status: "error", updatedAt: { gte: since24h } } }),
      prisma.agentSession.count({ where: { status: "running" } }),
      collectProcessHealth(),
      readDbSizeBytes(provider),
    ]);

  const providers = await Promise.all(
    (Object.keys(MODEL_PROVIDERS) as ModelProviderKey[]).map(async (key) => {
      const config = MODEL_PROVIDERS[key];
      try {
        const keys = await getAllKeys(key);
        const model = await resolveProviderModel(key);
        return { provider: key, name: config.name, keyCount: keys.length, model };
      } catch {
        return { provider: key, name: config.name, keyCount: 0, model: config.model };
      }
    }),
  );

  const index = readIndexFootprint();
  return {
    db: { connected: dbConnected, provider, sizeBytes },
    server: {
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMB: processHealth.rssMB,
      heapUsedMB: processHealth.heapUsedMB,
      heapLimitMB: processHealth.heapLimitMB,
      heapPct: processHealth.heapPct,
      pm2: processHealth.pm2
        ? {
            name: processHealth.pm2.name,
            status: processHealth.pm2.status,
            restarts: processHealth.pm2.restarts,
            unstableRestarts: processHealth.pm2.unstableRestarts,
            memoryMB: processHealth.pm2.memoryMB,
          }
        : null,
    },
    ai: {
      providers,
      missingKeyProviders: providers
        .filter((item) => item.keyCount === 0 && item.provider !== "vision")
        .map((item) => item.name),
    },
    agent: {
      totalSessions: agentTotal,
      errorSessions: agentError,
      errorSessions24h: agentError24h,
      runningSessions: agentRunning,
    },
    knowledge: { fileCount, chunkCount },
    index,
  };
}

export async function loadOpsStats(): Promise<OpsStats> {
  const [
    userCount,
    projectCount,
    knowledgeFileCount,
    knowledgeChunkCount,
    plagiarismCount,
    reviewCount,
    directionCount,
    agentSessionCount,
    agentSessionErrorCount,
    byStatus,
    byCategory,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.knowledgeFile.count(),
    prisma.knowledgeChunk.count(),
    prisma.plagiarismCheck.count(),
    prisma.reviewCheck.count(),
    prisma.direction.count(),
    prisma.agentSession.count(),
    prisma.agentSession.count({ where: { status: "error" } }),
    prisma.agentSession.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.knowledgeFile.groupBy({
      by: ["category"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return {
    userCount,
    projectCount,
    knowledgeFileCount,
    knowledgeChunkCount,
    plagiarismCount,
    reviewCount,
    directionCount,
    agentSessionCount,
    agentSessionErrorCount,
    agentSessionByStatus: byStatus.map((row) => ({ status: row.status, count: row._count.id })),
    filesByCategory: byCategory.slice(0, 12).map((row) => ({
      category: row.category,
      count: row._count.id,
    })),
  };
}

async function projectTitles(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  return new Map(projects.map((project) => [project.id, project.title]));
}

export async function listOpsSessions(input: {
  status?: string;
  q?: string;
  intentKind?: string;
  limit: number;
}): Promise<OpsSessionList> {
  const where: {
    status?: string;
    goal?: { contains: string; mode: "insensitive" };
    id?: string;
    OR?: Array<{ goal: { contains: string; mode: "insensitive" } } | { id: string }>;
    snapshot?: { path: string[]; equals: string };
  } = {};
  if (input.status && input.status !== "all" && SESSION_STATUSES.has(input.status)) {
    where.status = input.status;
  }
  const q = input.q?.trim() ?? "";
  if (q) {
    where.OR = [
      { goal: { contains: q, mode: "insensitive" } },
      { id: q },
    ];
  }
  if (input.intentKind && isIntentKind(input.intentKind)) {
    where.snapshot = { path: ["intentKind"], equals: input.intentKind };
  }

  const [rows, total] = await Promise.all([
    prisma.agentSession.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: input.limit,
      include: { user: { select: { name: true } } },
    }),
    prisma.agentSession.count({ where }),
  ]);
  const titles = await projectTitles(
    [...new Set(rows.map((row) => row.projectId).filter((id): id is string => Boolean(id)))],
  );

  return {
    total,
    items: rows.map((row) => {
      const fail = lastFailFromSnapshot(row.snapshot);
      return {
        id: row.id,
        ...(row.user?.name ? { userName: row.user.name } : {}),
        projectId: row.projectId,
        projectTitle: row.projectId ? (titles.get(row.projectId) ?? null) : null,
        directionSlug: row.directionSlug,
        goal: clip(row.goal, 160) ?? "",
        status: row.status,
        errorMessage: clip(row.errorMessage, 200),
        intentKind: intentKindFromSnapshot(row.snapshot),
        lastFail: fail
          ? {
              tool: fail.tool,
              ...(fail.via ? { via: fail.via } : {}),
              ...(fail.reason ? { reason: clip(fail.reason, 160) ?? undefined } : {}),
            }
          : null,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  };
}

/** 与后台强制中断相同：只改仍在 running 的那一行。 */
export async function interruptOpsSession(id: string): Promise<{ interrupted: boolean }> {
  const result = await prisma.agentSession.updateMany({
    where: { id, status: "running" },
    data: { status: "interrupted", errorMessage: OPS_INTERRUPT_MESSAGE },
  });
  return { interrupted: result.count > 0 };
}

export async function getOpsSession(id: string): Promise<OpsSessionDetail | null> {
  const row = await prisma.agentSession.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!row) return null;
  let projectTitle: string | null = null;
  if (row.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: row.projectId },
      select: { title: true },
    });
    projectTitle = project?.title ?? null;
  }
  const source: OpsSessionSource = {
    id: row.id,
    ...(row.user?.name ? { userName: row.user.name } : {}),
    projectId: row.projectId,
    projectTitle,
    directionSlug: row.directionSlug,
    goal: row.goal,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    snapshot: row.snapshot,
  };
  return viewOpsSession(source);
}

function uiFromSnapshot(snapshot: unknown): LoopUiMessage[] {
  if (!isAgentSessionSnapshot(snapshot) || !snapshot.uiTranscript) return [];
  const lines: LoopUiMessage[] = [];
  for (const message of snapshot.uiTranscript) {
    if (message.kind === "user") lines.push({ kind: "user", text: message.text });
    else if (message.kind === "action") lines.push({ kind: "action", tool: message.tool, params: message.params });
    else if (message.kind === "observation") lines.push({ kind: "observation", tool: message.tool, error: message.error });
  }
  return lines;
}

export async function scanOpsLoops(limit: number, days: number): Promise<OpsLoopScan> {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const rows = await prisma.agentSession.findMany({
    where: { updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, status: true, updatedAt: true, errorMessage: true, snapshot: true },
  });

  const inputs: LoopScanInput[] = rows.map((row) => {
    const snap = isAgentSessionSnapshot(row.snapshot) ? row.snapshot : null;
    return {
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      errorMessage: row.errorMessage,
      error: snap?.error ?? null,
      iteration: snap?.iteration ?? 0,
      toolCallCount: snap?.toolCallCount ?? 0,
      ui: uiFromSnapshot(row.snapshot),
      toolTrace: (snap?.toolTrace ?? []).map((item) => ({
        tool: item.tool,
        via: item.via,
        reason: item.reason,
      })),
    };
  });

  const classified = classifyLoopSessions(inputs);
  const status: Record<string, number> = {};
  const codeSessions = new Map<string, number>();
  const codeTurns = new Map<string, number>();
  let turns = 0;
  let sickSessions = 0;
  for (const session of classified) {
    status[session.status] = (status[session.status] ?? 0) + 1;
    turns += session.turnCount;
    const sessionCodes = new Set([...session.codes, ...session.turns.flatMap((turn) => turn.codes)]);
    if (sessionCodes.size > 0) sickSessions += 1;
    for (const code of sessionCodes) codeSessions.set(code, (codeSessions.get(code) ?? 0) + 1);
    for (const turn of session.turns) {
      for (const code of turn.codes) codeTurns.set(code, (codeTurns.get(code) ?? 0) + 1);
    }
  }

  const codes = [...new Set([...codeSessions.keys(), ...codeTurns.keys()])]
    .sort()
    .map((code) => ({
      code,
      label: codeLabel(code),
      sessions: codeSessions.get(code) ?? 0,
      turns: codeTurns.get(code) ?? 0,
    }));

  const samples = classified
    .filter((session) => session.codes.length > 0 || session.turns.length > 0)
    .slice(0, 8)
    .map((session) => ({
      id: session.id,
      status: session.status,
      updatedAt: session.updatedAt,
      codes: session.codes,
      turns: session.turns.slice(0, 3),
    }));

  return { sessions: rows.length, turns, sickSessions, days, status, codes, samples };
}

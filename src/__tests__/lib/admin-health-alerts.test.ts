import { describe, expect, it } from "vitest";
import { buildAdminHealthAlerts } from "@/lib/admin-health-alerts";
import type { AdminHealthData } from "@/contracts/admin";

function baseHealth(over: Partial<AdminHealthData> = {}): AdminHealthData {
  return {
    db: { connected: true, provider: "SQLite", sizeBytes: 1 },
    knowledge: {
      fileCount: 100,
      chunkCount: 10,
      uncategorizedCount: 0,
      diskSampleSize: 100,
      metadataOnlyInSample: 0,
      pdfMissingInSample: 0,
      categoryDriftInSample: 0,
    },
    index: { indexFiles: ["index.bin"], totalSizeBytes: 1 },
    server: { uptime: 1, nodeVersion: "v20", platform: "win32", memoryMB: 200 },
    ai: {
      providers: [{ provider: "deepseek", name: "DeepSeek", keyCount: 1, model: "x" }],
      missingKeyProviders: [],
    },
    agent: {
      totalSessions: 10,
      errorSessions: 0,
      errorSessions24h: 0,
      runningSessions: 0,
    },
    journalMetrics: {
      fileCount: 100,
      withAnyMetrics: 50,
      withImpactFactor: 50,
      coveragePct: 50,
      lastImport: null,
    },
    ...over,
  };
}

describe("buildAdminHealthAlerts", () => {
  it("alerts on missing AI key", () => {
    const alerts = buildAdminHealthAlerts(
      baseHealth({
        ai: {
          providers: [{ provider: "zhipu", name: "智谱", keyCount: 0, model: "g" }],
          missingKeyProviders: ["智谱"],
        },
      }),
    );
    expect(alerts.some((a) => a.message.includes("智谱"))).toBe(true);
  });

  it("alerts on low IF coverage and agent errors", () => {
    const alerts = buildAdminHealthAlerts(
      baseHealth({
        journalMetrics: {
          fileCount: 100,
          withAnyMetrics: 5,
          withImpactFactor: 5,
          coveragePct: 5,
          lastImport: null,
        },
        agent: {
          totalSessions: 20,
          errorSessions: 8,
          errorSessions24h: 4,
          runningSessions: 1,
        },
      }),
    );
    expect(alerts.some((a) => a.message.includes("期刊 IF"))).toBe(true);
    expect(alerts.some((a) => a.href.includes("agent-sessions"))).toBe(true);
  });

  it("alerts on PDF missing in sample", () => {
    const alerts = buildAdminHealthAlerts(
      baseHealth({
        knowledge: {
          fileCount: 10,
          chunkCount: 1,
          uncategorizedCount: 0,
          diskSampleSize: 10,
          metadataOnlyInSample: 0,
          pdfMissingInSample: 3,
          categoryDriftInSample: 1,
        },
      }),
    );
    expect(alerts.some((a) => a.message.includes("PDF"))).toBe(true);
    expect(alerts.some((a) => a.message.includes("分类"))).toBe(true);
  });
});

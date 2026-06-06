import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import { enrichKnowledgeRecordFromDisk } from "@/lib/knowledge-metadata";
import {
  lookupMetricsForBib,
  mergeJournalMetrics,
  normalizeIssn,
  parseJournalMetricsCsv,
} from "@/lib/journal-metrics";

describe("normalizeIssn", () => {
  it("strips hyphens", () => {
    expect(normalizeIssn("1234-5678")).toBe("12345678");
  });
});

describe("parseJournalMetricsCsv", () => {
  it("parses header and one row", () => {
    const csv = `issn,impactFactor,impactFactorYear,jcrQuartile,casPartition,isCoreJournal
1234-5678,5.2,2024,Q1,1区,true`;
    const map = parseJournalMetricsCsv(csv);
    expect(map.size).toBe(1);
    const m = map.get("12345678");
    expect(m?.impactFactor).toBe(5.2);
    expect(m?.jcrQuartile).toBe("Q1");
    expect(m?.isCoreJournal).toBe(true);
  });
});

describe("lookupMetricsForBib", () => {
  it("matches bib issn", () => {
    const map = parseJournalMetricsCsv("issn,impactFactor\n1234-5678,3.1");
    const m = lookupMetricsForBib({ issn: "1234-5678" }, map);
    expect(m?.impactFactor).toBe(3.1);
  });
});

describe("enrichKnowledgeRecordFromDisk", () => {
  it("keeps non-zero size without disk access", () => {
    const record = {
      name: "a.pdf",
      category: "未分类",
      chunkCount: 1,
      size: 4096,
      mtime: "",
    };
    expect(enrichKnowledgeRecordFromDisk(record).size).toBe(4096);
  });

  it("fills size from disk when prisma stored 0", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "statSync").mockReturnValue({ size: 8192 } as fs.Stats);
    const record = {
      name: "b.pdf",
      category: "水稻",
      chunkCount: 1,
      size: 0,
      mtime: "",
    };
    expect(enrichKnowledgeRecordFromDisk(record).size).toBe(8192);
    vi.restoreAllMocks();
  });
});

describe("mergeJournalMetrics", () => {
  it("keeps CSV IF when OpenAlex only adds citedBy", () => {
    const merged = mergeJournalMetrics(
      { impactFactor: 4, jcrQuartile: "Q2" },
      { citedByCount: 99 },
    );
    expect(merged.impactFactor).toBe(4);
    expect(merged.citedByCount).toBe(99);
  });
});

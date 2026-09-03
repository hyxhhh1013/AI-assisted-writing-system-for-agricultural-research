import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import { enrichKnowledgeRecordFromDisk } from "@/lib/knowledge-metadata";
import {
  lookupMetricsForBib,
  mergeJournalMetrics,
  normalizeIssn,
  parseJournalMetricsCsv,
  parseMetricsJson,
  bibHasIssnOrJournal,
} from "@/lib/journal-metrics";

describe("normalizeIssn", () => {
  it("strips hyphens", () => {
    expect(normalizeIssn("1234-5678")).toBe("12345678");
  });
});

describe("parseJournalMetricsCsv", () => {
  it("parses header and one row by issn", () => {
    const csv = `issn,impactFactor,impactFactorYear,jcrQuartile,casPartition,isCoreJournal
1234-5678,5.2,2024,Q1,1区,true`;
    const lookup = parseJournalMetricsCsv(csv);
    expect(lookup.byIssn.size).toBe(1);
    const m = lookup.byIssn.get("12345678");
    expect(m?.impactFactor).toBe(5.2);
    expect(m?.jcrQuartile).toBe("Q1");
    expect(m?.isCoreJournal).toBe(true);
  });

  it("parses journal column for name match", () => {
    const lookup = parseJournalMetricsCsv(
      "journal,impactFactor\nPlant Physiology,8.1",
    );
    expect(lookup.byJournal.size).toBe(1);
    expect(lookup.byJournal.get("plant physiology")?.impactFactor).toBe(8.1);
  });

  it("accepts Chinese column headers", () => {
    const lookup = parseJournalMetricsCsv(
      "刊名,影响因子,JCR分区\n土壤学报,3.5,Q1",
    );
    expect(lookup.byJournal.get("土壤学报")?.impactFactor).toBe(3.5);
    expect(lookup.byJournal.get("土壤学报")?.jcrQuartile).toBe("Q1");
  });
});

describe("parseMetricsJson", () => {
  it("coerces string impactFactor in stored JSON", () => {
    const m = parseMetricsJson('{"impactFactor":"4.2","jcrQuartile":"Q2"}');
    expect(m?.impactFactor).toBe(4.2);
    expect(m?.jcrQuartile).toBe("Q2");
  });
});

describe("lookupMetricsForBib", () => {
  it("matches bib issn", () => {
    const lookup = parseJournalMetricsCsv("issn,impactFactor\n1234-5678,3.1");
    const m = lookupMetricsForBib({ issn: "1234-5678" }, lookup);
    expect(m?.impactFactor).toBe(3.1);
  });

  it("falls back to journal name", () => {
    const lookup = parseJournalMetricsCsv(
      "journal,impactFactor\nNature Plants,15.0",
    );
    const m = lookupMetricsForBib({ journal: "Nature Plants, 2023" }, lookup);
    expect(m?.impactFactor).toBe(15);
  });

  it("detects matchable bib keys", () => {
    expect(bibHasIssnOrJournal({ issn: "1234-5678" })).toBe(true);
    expect(bibHasIssnOrJournal({ journal: "土壤学报" })).toBe(true);
    expect(bibHasIssnOrJournal({ title: "only title" })).toBe(false);
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

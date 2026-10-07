import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { joinLegacyPageText } from "../../../scripts/extractors/legacy-order.mjs";
import {
  orderPage,
  shadowPageFromItems,
  stripRepeatedMarginLines,
} from "../../../scripts/extractors/reading-order.mjs";
import { parseRagPropQueries } from "@/lib/eval/rag-prop-fixtures";
import { recallAt10 } from "../../../scripts/lib/rag-prop-eval.mjs";
import {
  harvestRagPropQueries,
  RAG_PROP_LABEL_NOTE,
} from "../../../scripts/lib/rag-prop-harvest.mjs";
import { goldSentencesPass } from "../../../scripts/lib/gold-sentences.mjs";
import {
  isDeepNightWindow,
  repairFailedPages,
} from "../../../scripts/lib/reading-order-repair.mjs";
import { splitSentences } from "../../../scripts/lib/sentences.mjs";
import fakeQueries from "../fixtures/rag-prop-queries.json";

function item(str: string, x: number, y: number, width: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

function words(
  text: string,
  x: number,
  y: number,
  charWidth = 6,
): ReturnType<typeof item>[] {
  return text.split(" ").filter(Boolean).map((word, index) => {
    const width = word.length * charWidth;
    const placed = item(word, x, y, width);
    x += width + 3;
    void index;
    return placed;
  });
}

describe("reading order shadow", () => {
  it("reads the left column before the right column", () => {
    const items = [
      ...words("The soil pH", 40, 700),
      ...words("increased after biochar.", 40, 680),
      ...words("Yield did not", 340, 700),
      ...words("change this year.", 340, 680),
    ];
    const legacy = joinLegacyPageText(items);
    expect(legacy).toContain("The soil pH Yield did not");
    expect(joinLegacyPageText(items)).toBe(legacy);

    const ordered = orderPage(items);
    expect(ordered.bodyText).toBe(
      ["The soil pH", "increased after biochar.", "Yield did not", "change this year."].join("\n"),
    );
    expect(ordered.lines.some((line: { crossColumn: boolean }) => line.crossColumn)).toBe(false);
  });

  it("keeps a full-width title intact above the columns", () => {
    const items = [
      item("Biochar effects on paddy soil carbon", 40, 760, 460),
      ...words("Left column sentence here.", 40, 700),
      ...words("Right column sentence here.", 360, 700),
    ];
    const ordered = orderPage(items);
    expect(ordered.lines[0]?.text).toBe("Biochar effects on paddy soil carbon");
    expect(ordered.lines[0]?.column).toBeNull();
    expect(ordered.bodyText.indexOf("Left column")).toBeLessThan(
      ordered.bodyText.indexOf("Right column"),
    );
  });

  it("reads three columns from left to right", () => {
    const items = [
      ...words("Alpha one.", 40, 700),
      ...words("Alpha two.", 40, 680),
      ...words("Beta one.", 220, 700),
      ...words("Beta two.", 220, 680),
      ...words("Gamma one.", 400, 700),
      ...words("Gamma two.", 400, 680),
    ];
    expect(orderPage(items).bodyText).toBe(
      ["Alpha one.", "Alpha two.", "Beta one.", "Beta two.", "Gamma one.", "Gamma two."].join("\n"),
    );
  });

  it("matches legacy order on a single Chinese column", () => {
    const items = [
      item("生物炭提高了土壤 pH。", 72, 700, 120),
      item("产量在第二年没有下降。", 72, 676, 140),
    ];
    const ordered = orderPage(items);
    expect(ordered.lines.map((line: { column: number | null }) => line.column)).toEqual([0, 0]);
    expect(ordered.bodyText.replace(/\n/g, " ")).toBe(joinLegacyPageText(items));
    expect(joinLegacyPageText(items)).toContain("生物炭提高了土壤 pH。");
  });

  it("marks a glyph run that crosses the column gutter and keeps the old page text", () => {
    const items = [
      ...words("Left column stays.", 40, 700),
      ...words("Right column stays.", 340, 700),
      item("bridges the gutter badly", 90, 640, 280),
    ];
    const shadow = shadowPageFromItems(items, "旧页正文");
    expect(shadow.keptOld).toBe(true);
    expect(shadow.text).toBe("旧页正文");
    expect(shadow.crossColumn).toBeGreaterThan(0);
    expect(shadow.lines.some((line: { text: string }) => line.text.includes("bridges"))).toBe(true);
  });
});

describe("running headers", () => {
  function page(header: string, body: string, footer: string) {
    return {
      lines: [
        { text: header, y: 800 },
        { text: body, y: 400 },
        { text: footer, y: 20 },
      ],
    };
  }

  it("drops a repeated journal name and page-number headers, but keeps the same phrase in the body", () => {
    const pages = stripRepeatedMarginLines([
      page("Nature Energy", "Nature Energy", "Smith et al. 12"),
      page("Nature Energy", "土壤 pH 升高。", "Smith et al. 7"),
      page("Nature Energy", "产量没有下降。", "Smith et al. 3"),
    ]);
    expect(pages[0]?.lines.map((line) => line.text)).toEqual(["Nature Energy"]);
    expect(pages[1]?.lines.map((line) => line.text)).toEqual(["土壤 pH 升高。"]);
    expect(pages[2]?.lines.map((line) => line.text)).toEqual(["产量没有下降。"]);
  });
});

describe("rag prop fixtures and recall", () => {
  it("rejects a query without expectSources", () => {
    expect(() => parseRagPropQueries([{ query: "生物炭提高了土壤 pH。", title: "", section: "" }])).toThrow(
      /expectSources/,
    );
  });

  it("loads the three hypothetical queries", () => {
    const rows = parseRagPropQueries(fakeQueries);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.expectSources).toEqual(["hypothetical-biochar.pdf"]);
  });

  it("scores recall@10 from an injected ranking", () => {
    const rows = parseRagPropQueries(fakeQueries);
    const score = recallAt10(
      rows.map((row, index) => ({
        expectSources: row.expectSources,
        rankedSources:
          index === 1
            ? ["other.pdf"]
            : ["hypothetical-biochar.pdf", "10.0000/hypothetical", "hypothetical-yield.pdf", "10.0000/yield"],
      })),
    );
    expect(score).toBeCloseTo(2 / 3);
  });
});

describe("harvest rag prop queries", () => {
  it("emits the query and the hit source, and does not treat the hit as gold", () => {
    const rows = harvestRagPropQueries({
      uiTranscript: [
        {
          kind: "action",
          tool: "search_knowledge",
          params: { query: "生物炭提高了土壤 pH。", section: "results" },
        },
        {
          kind: "action",
          tool: "write_section",
          params: { section: "discussion", claims: ["产量在第二年没有下降。"] },
        },
      ],
      observations: [
        {
          tool: "search_knowledge",
          success: true,
          data: { hits: [{ source: "wrong-hit.pdf" }] },
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      query: "生物炭提高了土壤 pH。",
      hitSources: ["wrong-hit.pdf"],
      expectSources: [],
      note: RAG_PROP_LABEL_NOTE,
    });
    expect(rows[1]?.query).toBe("产量在第二年没有下降。");
    expect(rows[1]?.expectSources).toEqual([]);
    expect(rows[0]?.note).toContain("不能当作金标");
  });

  it("prints the labeling list from a snapshot file and does not write it back", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rag-prop-"));
    const file = path.join(dir, "snapshot.json");
    writeFileSync(
      file,
      JSON.stringify({
        uiTranscript: [
          { kind: "action", tool: "search_knowledge", params: { query: "生物炭提高了土壤 pH。" } },
        ],
        observations: [
          { tool: "search_knowledge", success: true, data: { hits: [{ source: "hit.pdf" }] } },
        ],
      }),
    );
    const out = execFileSync(process.execPath, ["scripts/harvest-rag-prop-queries.mjs", file], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const rows = JSON.parse(out) as { hitSources: string[]; expectSources: string[]; note: string }[];
    expect(rows[0]?.hitSources).toEqual(["hit.pdf"]);
    expect(rows[0]?.expectSources).toEqual([]);
    expect(rows[0]?.note).toContain("不能当作金标");
  });
});

describe("gold sentences", () => {
  it("accepts normalized inclusion", () => {
    expect(
      goldSentencesPass("The soil pH\nincreased after biochar.", ["The soil pH", "increased after biochar."]),
    ).toBe(true);
    expect(goldSentencesPass("左右栏拼在一起", ["The soil pH increased after biochar."])).toBe(false);
  });
});

describe("night window repair", () => {
  it("is open only from 00:30 to 05:00 Shanghai", () => {
    expect(isDeepNightWindow(new Date("2026-10-07T16:30:00.000Z"))).toBe(true);
    expect(isDeepNightWindow(new Date("2026-10-07T16:29:00.000Z"))).toBe(false);
    expect(isDeepNightWindow(new Date("2026-10-07T20:59:00.000Z"))).toBe(true);
    expect(isDeepNightWindow(new Date("2026-10-07T21:00:00.000Z"))).toBe(false);
    expect(isDeepNightWindow(new Date("2026-10-07T14:00:00.000Z"))).toBe(false);
  });

  it("keeps the old sentence when the parser still fails", () => {
    const kept = repairFailedPages(
      [{ id: "p1", crossColumn: true, shadowText: "新错句", oldText: "旧页正文" }],
      () => ({ ok: false, text: "仍是错句", crossColumn: true }),
    );
    expect(kept[0]?.text).toBe("旧页正文");
    expect(kept[0]?.keptOld).toBe(true);
  });

  it("replaces the page when the parser returns a clean sentence", () => {
    const replaced = repairFailedPages(
      [{ id: "p1", crossColumn: true, shadowText: "新错句", oldText: "旧页正文" }],
      () => ({ ok: true, text: "The soil pH increased after biochar.", crossColumn: false }),
    );
    expect(replaced[0]?.text).toBe("The soil pH increased after biochar.");
    expect(replaced[0]?.repaired).toBe(true);
  });

  it("exits outside the night window without touching an index", () => {
    const out = execFileSync(process.execPath, ["scripts/repair-reading-order-pages.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, RAG_PROP_NOW: "2026-10-07T14:00:00.000Z" },
      encoding: "utf8",
    });
    expect(out).toContain("未读写索引");
  });

  it("does not call the parser for a clean page", () => {
    const clean = repairFailedPages(
      [{ id: "p1", crossColumn: false, shadowText: "干净正文", oldText: "旧页正文" }],
      () => {
        throw new Error("不应调用解析器");
      },
    );
    expect(clean[0]?.text).toBe("干净正文");
  });
});

describe("sentence split", () => {
  it("keeps abbreviations, decimals, semicolons, and short sentences", () => {
    expect(splitSentences("Smith et al. reported Fig. 3 in 3.5% of plots.")).toEqual([
      "Smith et al. reported Fig. 3 in 3.5% of plots.",
    ]);
    expect(splitSentences("生物炭提高了土壤 pH；产量在第二年没有下降。")).toEqual([
      "生物炭提高了土壤 pH；产量在第二年没有下降。",
    ]);
    expect(splitSentences("见图 1。")).toEqual(["见图 1。"]);
  });
});

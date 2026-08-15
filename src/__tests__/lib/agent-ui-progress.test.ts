import { describe, expect, it } from "vitest";
import {
  formatToolParamHint,
  formatToolWorkingLine,
  humanizeToolNotice,
  isSoftToolNotice,
  resolveLiveProgress,
} from "@/lib/agent/ui-progress";

describe("agent ui-progress", () => {
  it("formats working lines for common tools", () => {
    expect(formatToolWorkingLine("read_reference", { index: 2 })).toContain("[2]");
    expect(formatToolWorkingLine("write_section", { section: "introduction" })).toContain("引言");
    expect(formatToolWorkingLine("ingest_project_data", { fileName: "yield.csv" })).toMatch(/表格|数据/);
    expect(formatToolParamHint("ingest_project_data", { fileName: "yield.csv" })).toBe("yield.csv");
  });

  it("softens stagnant notices for users", () => {
    const raw =
      "已连续 3 次工具调用未改变项目状态（大纲/文献/章节等）。请停止调工具，用中文总结";
    expect(isSoftToolNotice(raw)).toBe(true);
    expect(humanizeToolNotice(raw)).not.toMatch(/请停止调工具/);
    expect(humanizeToolNotice(raw)).toMatch(/继续写|整理/);
  });

  it("resolves live progress from pending action", () => {
    expect(
      resolveLiveProgress({
        status: "executing",
        isRunning: true,
        messages: [
          { kind: "user", text: "写引言" },
          { kind: "action", tool: "read_reference", params: { index: 1 } },
        ],
      }),
    ).toContain("文献 [1]");
  });

  it("falls back to thinking copy", () => {
    expect(
      resolveLiveProgress({
        status: "thinking",
        isRunning: true,
        messages: [{ kind: "user", text: "写引言" }],
      }),
    ).toMatch(/思考/);
  });

  describe("formatToolParamHint(import_reference)", () => {
    it("prefers selectedIndices count (实际批量) over model hitJson", () => {
      expect(
        formatToolParamHint("import_reference", {
          selectedIndices: [0, 1, 2],
          hitJson: JSON.stringify({ id: "doi:1", title: "A", authors: [], source: "openalex" }),
        }),
      ).toBe("3 篇");
    });

    it("falls back to importItems candidate count", () => {
      expect(
        formatToolParamHint("import_reference", {
          importItems: [{ id: "doi:1" }, { id: "doi:2" }],
        }),
      ).toBe("2 篇");
    });

    it("shows 1 篇 for single hitJson", () => {
      expect(
        formatToolParamHint("import_reference", {
          hitJson: JSON.stringify({ id: "doi:1", title: "A", authors: [], source: "openalex" }),
        }),
      ).toBe("1 篇");
    });

    it("shows N 篇 for hitsJson array", () => {
      expect(
        formatToolParamHint("import_reference", {
          hitsJson: JSON.stringify([{ id: "doi:1" }, { id: "doi:2" }]),
        }),
      ).toBe("2 篇");
    });

    it("returns null when nothing to count", () => {
      expect(formatToolParamHint("import_reference", {})).toBeNull();
    });
  });
});

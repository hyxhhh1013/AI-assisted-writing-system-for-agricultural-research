import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fixConsistencyIssue,
  runConsistencyCheck,
  toFixableReport,
} from "@/services/consistency";
import type { ConsistencyReport } from "@/contracts/consistency";

describe("consistency service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runConsistencyCheck posts to /api/consistency", async () => {
    const report: ConsistencyReport = {
      passed: true,
      summary: "ok",
      issues: [],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => report,
    } as Response);

    const result = await runConsistencyCheck({
      title: "测试论文",
      sections: [{ key: "introduction", content: "引言" }],
    });

    expect(result.passed).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/consistency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "测试论文",
        sections: [{ key: "introduction", content: "引言" }],
      }),
    });
  });

  it("toFixableReport marks issues as open", () => {
    const fixable = toFixableReport({
      passed: false,
      summary: "2 issues",
      issues: [
        {
          type: "logic",
          severity: "high",
          sections: ["results"],
          description: "矛盾",
          suggestion: "改",
        },
      ],
    });
    expect(fixable.issues[0].status).toBe("open");
  });

  it("fixConsistencyIssue reads SSE delta and done", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"delta","content":"修"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"done","content":"修正段落"}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const text = await fixConsistencyIssue({
      title: "T",
      issue: {
        type: "logic",
        severity: "medium",
        sections: ["results"],
        description: "d",
        suggestion: "s",
      },
      sectionContents: { results: "原文" },
    });

    expect(text).toBe("修正段落");
    expect(fetch).toHaveBeenCalledWith("/api/consistency/fix", expect.objectContaining({ method: "POST" }));
  });
});

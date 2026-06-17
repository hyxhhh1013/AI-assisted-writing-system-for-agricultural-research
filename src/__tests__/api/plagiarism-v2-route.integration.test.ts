import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { parseSseJsonEvents } from "@/__tests__/helpers/sse";

const mockRunCheck = vi.hoisted(() => vi.fn());

vi.mock("@/services/plagiarism-service", () => ({
  runPlagiarismCheck: mockRunCheck,
}));

import { POST } from "@/app/api/plagiarism/v2/route";
import { USER_ID_HEADER } from "@/lib/auth";

const AUTH_HEADERS = { [USER_ID_HEADER]: "user-test-1" };

const LONG_CONTENT =
  "本研究采用热重分析法对生物质样品进行了系统分析，考察了不同热解温度对生物炭产率与表面性质的影响，实验在惰性气氛下完成。";

describe("POST /api/plagiarism/v2 — SSE integration", () => {
  beforeEach(() => {
    mockRunCheck.mockImplementation(
      async (
        _input: unknown,
        onProgress?: (e: { stage: string; message: string }) => void,
      ) => {
        onProgress?.({ stage: "splitting", message: "正在分析文本结构..." });
        onProgress?.({ stage: "self_duplication", message: "正在检测自引重复..." });
        return {
          checkId: "chk-mock",
          totalMatches: 0,
          maxSimilarity: 0,
          overallRisk: "low",
          matches: [],
          stats: {
            totalParagraphs: 1,
            sampledParagraphs: 1,
            selfMatches: 0,
            crossMatches: 0,
            knowledgeMatches: 0,
            embeddingMatches: 0,
            webMatches: 0,
            clicheMatches: 0,
            aiMatches: 0,
            processingTime: 10,
          },
        };
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("streams progress then done when Accept is SSE", async () => {
    const req = new NextRequest("http://localhost/api/plagiarism/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...AUTH_HEADERS,
      },
      body: JSON.stringify({
        title: "测试论文",
        content: LONG_CONTENT,
        webSearch: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await parseSseJsonEvents(res);
    const types = events.map((e) => e.type);
    expect(types).toContain("progress");
    expect(types).toContain("done");

    const progress = events.filter((e) => e.type === "progress");
    expect(progress[0]).toMatchObject({ stage: "splitting" });
    expect(progress[1]).toMatchObject({ stage: "self_duplication" });

    const done = events.find((e) => e.type === "done");
    expect(done?.data).toMatchObject({ checkId: "chk-mock" });
    expect(mockRunCheck).toHaveBeenCalledOnce();
  });

  it("returns JSON body in non-SSE mode", async () => {
    const req = new NextRequest("http://localhost/api/plagiarism/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({
        title: "测试论文",
        content: LONG_CONTENT,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { checkId: string };
    expect(json.checkId).toBe("chk-mock");
  });
});

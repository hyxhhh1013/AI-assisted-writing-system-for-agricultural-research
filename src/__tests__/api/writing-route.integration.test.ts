import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { parseSseJsonEvents } from "@/__tests__/helpers/sse";

const mockRunPipeline = vi.hoisted(() => vi.fn());

vi.mock("@/app/api/writing/run-pipeline", () => ({
  runWritingPipeline: mockRunPipeline,
}));

vi.mock("@/lib/ai", () => ({
  getAgentModelConfig: vi.fn(() => ({
    provider: "deepseek",
    config: { id: "deepseek", label: "DeepSeek" },
    keyError: null,
  })),
}));

import { POST } from "@/app/api/writing/route";

const VALID_BODY = {
  title: "热解温度对生物炭产率的影响",
  section: "introduction",
  context: "本研究关注生物质热解工艺参数及其对生物炭产率的影响机制。",
  mode: "fast",
};

describe("POST /api/writing — SSE integration", () => {
  beforeEach(() => {
    mockRunPipeline.mockImplementation(async ({ emit, finishStream }) => {
      emit({ type: "status", status: "retrieving" });
      emit({ type: "pipeline_step", step: "retrieving", status: "running", detail: "mock" });
      finishStream();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns text/event-stream and first event has type", async () => {
    const req = new NextRequest("http://localhost/api/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await parseSseJsonEvents(res);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("status");
    expect(mockRunPipeline).toHaveBeenCalledOnce();
  });

  it("returns 400 when context is missing", async () => {
    const req = new NextRequest("http://localhost/api/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", section: "introduction" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});

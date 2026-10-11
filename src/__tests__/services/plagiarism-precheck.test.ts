import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  plagiarismCheck: {
    create: vi.fn(),
    update: vi.fn(),
  },
  plagiarismMatch: {
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  section: {
    findMany: vi.fn(),
  },
}));

const ragMock = vi.hoisted(() => ({
  search: vi.fn(),
}));

const aiMock = vi.hoisted(() => ({
  callAI: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/rag", () => ({ localRAG: ragMock }));
vi.mock("@/lib/ai", () => ({ callAI: aiMock.callAI }));

import { runPlagiarismCheck } from "@/services/plagiarism-service";

const CHUNK = "生物炭在热解过程中保留了木质素芳香结构并提高了土壤阳离子交换量，这一现象在稻壳原料中尤为明显。";

function installDb() {
  const stored: Array<Record<string, unknown> & { id: string; matchType?: string; matchedFrom?: string; matchedText?: string; similarity?: number }> = [];
  prismaMock.plagiarismCheck.create.mockResolvedValue({ id: "chk-1" });
  prismaMock.plagiarismCheck.update.mockResolvedValue({ id: "chk-1" });
  prismaMock.plagiarismMatch.createMany.mockImplementation(async (args: { data: Array<Record<string, unknown>> }) => {
    stored.splice(0, stored.length, ...args.data.map((row, index) => ({ id: `m${index}`, ...row })));
    return { count: stored.length };
  });
  prismaMock.plagiarismMatch.findMany.mockImplementation(async () => [...stored]);
  prismaMock.section.findMany.mockResolvedValue([]);
  ragMock.search.mockResolvedValue([]);
  aiMock.callAI.mockResolvedValue({
    text: async () => JSON.stringify({ score: 0, findings: [] }),
  });
  return stored;
}

describe("runPlagiarismCheck precheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the knowledge file when the manuscript pastes a library chunk", async () => {
    ragMock.search.mockResolvedValue([
      {
        content: CHUNK,
        metadata: { source: "稻壳生物炭.pdf", category: "lab", id: "c1" },
      },
    ]);
    aiMock.callAI.mockRejectedValue(new Error("timeout"));

    const run = () => runPlagiarismCheck({
      title: "金标",
      content: `结果：\n${CHUNK}`,
      userId: "user-1",
      sections: [{ key: "results", title: "结果", content: CHUNK }],
      referenceTitles: ["稻壳生物炭.pdf"],
    });

    const first = await run();
    const second = await run();
    const hit = first.matches.find((match) => match.matchType === "local");
    expect(hit?.matchedFrom).toBe("项目文献·稻壳生物炭.pdf");
    expect(hit?.matchedText).toContain("木质素");
    expect(second.matches.find((match) => match.matchType === "local")?.matchedFrom).toBe(hit?.matchedFrom);
    expect(first.aiStatus).toBe("failed");
    expect(first.overlapCoverage).toBeGreaterThan(0.25);
    expect(first.overallRisk).toBe("high");
    expect(first.maxSimilarity).toBe(first.overlapCoverage);
  });

  it("keeps a suspicious AI finding out of the overlap score", async () => {
    aiMock.callAI.mockResolvedValue({
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 90,
              findings: [{ type: "suspicious", detail: "疑似照搬方法段，相似度看起来有四成" }],
            }),
          },
        }],
      }),
    });

    const result = await runPlagiarismCheck({
      title: "自写短文",
      content: "本研究在温室中比较了三种氮肥用量对水稻分蘖和籽粒灌浆的影响，每个处理设置四次重复。",
      userId: "user-1",
    });

    expect(result.aiStatus).toBe("ok");
    expect(result.matches.some((match) => match.matchType === "ai")).toBe(true);
    expect(result.overlapCoverage).toBe(0);
    expect(result.overallRisk).toBe("low");
    expect(result.maxSimilarity).toBe(0);
  });

  it("flags a sentence contained in another project's longer section", async () => {
    const sentence = "生物炭在热解过程中保留了木质素芳香结构并提高了土壤阳离子交换量";
    prismaMock.section.findMany.mockResolvedValue([
      {
        content: `${sentence}。随后补充了温度、停留时间和载气流量对产率的影响，并记录了三组重复的灰分变化。`,
        project: { title: "上一篇稻壳稿" },
      },
    ]);

    const result = await runPlagiarismCheck({
      title: "跨项目",
      content: `${sentence}。`,
      userId: "user-1",
      literalOnly: true,
    });

    const cross = result.matches.find((match) => match.matchType === "cross");
    expect(cross?.matchedFrom).toBe("上一篇稻壳稿");
    expect(cross?.similarity).toBeGreaterThan(0.8);
    expect(result.aiStatus).toBe("skipped");
  });

  it("reports a recheck label and fixed cliche patterns without raising overlap", async () => {
    const messages: string[] = [];
    const result = await runPlagiarismCheck(
      {
        title: "套话",
        content: "这种方法得到了研究人员的关注。那种途径也得到了实验室的关注。随着农业机械化的发展。随着工厂化育秧的发展。近年来直播稻面积扩大。近年来机插秧比例上升。",
        userId: "user-1",
        literalOnly: false,
        recheckLabel: "讨论",
      },
      (event) => messages.push(event.message),
    );

    expect(messages.some((message) => message.includes("讨论"))).toBe(true);
    const cliche = result.matches.find((match) => match.sourceText.startsWith("【学术套话】"));
    expect(cliche?.similarity).toBe(0);
    expect(result.overlapCoverage).toBe(0);
    expect(result.overallRisk).toBe("low");
  });

  it("warns when every web search fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const messages: string[] = [];
    const result = await runPlagiarismCheck(
      {
        title: "联网",
        content: "本研究在温室中比较了三种氮肥用量对水稻分蘖和籽粒灌浆的影响，每个处理设置四次重复。",
        userId: "user-1",
        webSearch: true,
        config: { webSearch: true, academicCliche: false, aiAssessment: false },
      },
      (event) => messages.push(event.message),
    );
    expect(result.warnings?.[0]).toContain("联网搜索失败");
    expect(messages.some((message) => message.includes("联网搜索失败"))).toBe(true);
    expect(result.overlapCoverage).toBe(0);
  });
});

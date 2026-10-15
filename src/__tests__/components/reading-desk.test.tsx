// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReadingDesk } from "@/components/shared/quality/reading-desk";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";

afterEach(cleanup);

const result: PlagiarismCheckResult = {
  checkId: "chk-1",
  totalMatches: 2,
  maxSimilarity: 0.12,
  overlapCoverage: 0.12,
  overallRisk: "medium",
  matches: [
    {
      id: "local-1",
      sourceText: "生物炭产率下降",
      sourceOffset: 2,
      sourceLength: 7,
      matchType: "local",
      matchedText: "产率随温度下降",
      matchedFrom: "茶枝热解.pdf",
      similarity: 0.62,
      riskLevel: "high",
    },
    {
      id: "ai-1",
      sourceText: "【AI 评估】套话偏多",
      sourceOffset: 0,
      sourceLength: 0,
      matchType: "ai",
      matchedText: "套话偏多",
      matchedFrom: "学术套话检测",
      similarity: 0,
      riskLevel: "low",
    },
  ],
  stats: {
    totalParagraphs: 1,
    sampledParagraphs: 1,
    selfMatches: 0,
    crossMatches: 0,
    knowledgeMatches: 1,
    embeddingMatches: 0,
    webMatches: 0,
    clicheMatches: 0,
    aiMatches: 1,
    processingTime: 10,
  },
};

describe("ReadingDesk", () => {
  it("shows the source when a highlighted sentence is clicked", () => {
    render(
      <ReadingDesk
        hasProject
        content="前文生物炭产率下降后文"
        result={result}
        previousOverlap={null}
        checking={false}
        stage={null}
        error={null}
        webSearch={false}
        onWebSearch={vi.fn()}
        projects={[]}
        selectedProjectId="p1"
        loadingProject={false}
        onLoadProject={vi.fn()}
        onCheck={vi.fn()}
        onCancel={vi.fn()}
        sections={[]}
        scope="full"
        onApplied={vi.fn()}
        reviewOpen={false}
        onOpenReview={vi.fn()}
        onCloseReview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生物炭产率下降" }));
    expect(screen.getAllByText("茶枝热解.pdf").length).toBeGreaterThan(0);
    expect(screen.getByText("送检句")).toBeTruthy();
    expect(screen.getByText("相似片段")).toBeTruthy();
    expect(screen.getByText("产率随温度下降")).toBeTruthy();
    expect(screen.getByText("学术套话检测")).toBeTruthy();
  });

  it("underlines a review quote and keeps unmatched issues off the manuscript", () => {
    const body = "前文生物炭产率下降。后文需要补充实验条件。";
    const sections = [{ key: "results", title: "结果", content: body, wordCount: body.length }];
    const content = `结果：\n${body}`;
    const quote = "后文需要补充实验条件";
    const emptyDimension = {
      score: 80,
      grade: "B" as const,
      issueCount: 0,
      breakdown: { high: 0, medium: 0, low: 0 },
      basis: [] as string[],
      issues: [],
    };
    const placedIssue = {
      id: "iss-1",
      dimension: "academic" as const,
      type: "vague" as const,
      severity: "medium" as const,
      location: "结果",
      evidence: "缺条件",
      description: "这里缺实验条件",
      suggestion: "补上温度",
      originalText: quote,
      status: "open" as const,
      fixedContent: "补过的本章",
    };
    const missedIssue = {
      ...placedIssue,
      id: "iss-2",
      location: "火星章节",
      description: "对不上的意见",
      originalText: undefined,
      fixedContent: undefined,
    };

    render(
      <ReadingDesk
        hasProject
        content={content}
        result={{
          ...result,
          matches: [{
            ...result.matches[0]!,
            sourceOffset: content.indexOf("生物炭产率下降"),
            sourceLength: "生物炭产率下降".length,
          }],
        }}
        previousOverlap={null}
        checking={false}
        stage={null}
        error={null}
        webSearch={false}
        onWebSearch={vi.fn()}
        projects={[]}
        selectedProjectId="p1"
        loadingProject={false}
        onLoadProject={vi.fn()}
        onCheck={vi.fn()}
        onCancel={vi.fn()}
        sections={sections}
        scope="full"
        onApplied={vi.fn()}
        reviewOpen={false}
        onOpenReview={vi.fn()}
        onCloseReview={vi.fn()}
        reviewReport={{
          reviewId: "rev-1",
          synopsis: "",
          summary: "",
          overallScore: 72,
          overallGrade: "B",
          createdAt: "",
          dimensions: {
            academic: { ...emptyDimension, issueCount: 2, issues: [placedIssue, missedIssue] },
            argument: emptyDimension,
            structure: emptyDimension,
            integrity: emptyDimension,
          },
        }}
      />,
    );

    expect(screen.getByText("审查 72 分")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^结果/ })).toBeNull();
    expect(screen.getByRole("button", { name: "对不上的意见" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: quote }));
    expect(screen.getByText("这里缺实验条件")).toBeTruthy();
    expect(screen.getByRole("button", { name: "写入本章" })).toBeTruthy();
    expect(screen.queryByText("茶枝热解.pdf")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "生物炭产率下降" }));
    expect(screen.getAllByText("茶枝热解.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("这里缺实验条件")).toBeNull();
  });

  it("keeps a style note out of the manuscript even when the sentence is in the text", () => {
    render(
      <ReadingDesk
        hasProject
        content="前文近年来生物质转化效率下降后文"
        result={{
          ...result,
          overlapCoverage: 0,
          matches: [{
            id: "ai-quote",
            sourceText: "近年来生物质转化效率下降",
            sourceOffset: 2,
            sourceLength: 12,
            matchType: "ai",
            matchedText: "近年来，出现 1 次",
            matchedFrom: "学术套话检测",
            similarity: 0,
            riskLevel: "low",
          }],
        }}
        previousOverlap={null}
        checking={false}
        stage={null}
        error={null}
        webSearch={false}
        onWebSearch={vi.fn()}
        projects={[]}
        selectedProjectId="p1"
        loadingProject={false}
        onLoadProject={vi.fn()}
        onCheck={vi.fn()}
        onCancel={vi.fn()}
        sections={[]}
        scope="full"
        onApplied={vi.fn()}
        reviewOpen={false}
        onOpenReview={vi.fn()}
        onCloseReview={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "近年来生物质转化效率下降" })).toBeNull();
    expect(screen.getByText(/文献库、文内和跨项目都没有对上的句子/)).toBeTruthy();
    expect(screen.getByText("学术套话检测")).toBeTruthy();
    expect(screen.queryByText("送检句")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  assertAgentScriptTrace,
  listAgentScriptIds,
  runAgentScriptCases,
  summarizeAgentScriptResults,
  AGENT_SCRIPT_FIXTURES,
} from "@/lib/eval/agent-scripts";

describe("W3-AP-EVAL-SCRIPTS agent behavior scripts", () => {
  it("covers P1–P6 with pass and fail fixtures", () => {
    const ids = new Set(AGENT_SCRIPT_FIXTURES.map((f) => f.trace.scriptId));
    for (const id of listAgentScriptIds()) {
      expect(ids.has(id), `missing fixtures for ${id}`).toBe(true);
    }
    const hasPass = listAgentScriptIds().every((id) =>
      AGENT_SCRIPT_FIXTURES.some((f) => f.trace.scriptId === id && f.expectPass),
    );
    const hasFail = listAgentScriptIds().every((id) =>
      AGENT_SCRIPT_FIXTURES.some((f) => f.trace.scriptId === id && !f.expectPass),
    );
    expect(hasPass).toBe(true);
    expect(hasFail).toBe(true);
  });

  it("full script suite is green", () => {
    const results = runAgentScriptCases();
    const summary = summarizeAgentScriptResults(results);
    if (summary.failed > 0) {
      const msg = summary.failures
        .map((f) => {
          const detail = f.failures.map((x) => x.message).join("; ");
          return `- ${f.fixtureId} (expectPass=${f.expectPass}): ${detail}`;
        })
        .join("\n");
      expect.fail(`${summary.failed} script fixture(s) failed:\n${msg}`);
    }
    expect(summary.passed).toBe(AGENT_SCRIPT_FIXTURES.length);
  });

  it("P1 reject first-tool write", () => {
    const fails = assertAgentScriptTrace({
      scriptId: "P1",
      goals: ["看看项目现在卡在哪"],
      tools: [{ tool: "generate_outline", success: true }],
      finalText: "已生成大纲，建议下一步写引言。",
    });
    expect(fails.some((f) => f.code === "p1-first-tool" || f.code === "p1-inspect")).toBe(
      true,
    );
  });

  it("P2 reject fabricated hitJson", () => {
    const real = JSON.stringify({ id: "a", title: "A", authors: [], source: "openalex" });
    const fake = JSON.stringify({ id: "b", title: "B", authors: [], source: "openalex" });
    const fails = assertAgentScriptTrace({
      scriptId: "P2",
      goals: ["导入文献"],
      hadConfirm: true,
      tools: [
        {
          tool: "search_external",
          success: true,
          data: { items: [{ hitJson: real }] },
        },
        {
          tool: "import_reference",
          params: { hitJson: fake, userConfirmed: true },
          success: true,
          data: { persisted: true },
        },
      ],
      referenceCountBefore: 0,
      referenceCountAfter: 1,
    });
    expect(fails.some((f) => f.code === "p2-fabricated-hit")).toBe(true);
  });
});

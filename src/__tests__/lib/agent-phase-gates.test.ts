import { describe, expect, it } from "vitest";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import { getPhaseTaskPack } from "@/contracts/phase-task-pack";

function snap(overrides: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "T",
    mode: "review",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "x",
    outline: "",
    references: [],
    dataClaims: [],
    currentPhase: 1,
    hasWritingBlueprint: false,
    hasArgumentBlueprint: false,
    sectionFills: [],
    hasPaperConfig: true,
    ...overrides,
  };
}

describe("checkAgentToolPhaseGate", () => {
  it("allows read tools without project", () => {
    expect(checkAgentToolPhaseGate("search_knowledge", {}, null).ok).toBe(true);
  });

  it("blocks write_section without outline and points to generate_outline", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "introduction" },
      snap({ outline: "太短", currentPhase: 4 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/generate_outline/);
  });

  it("blocks write_section without writing blueprint even with outline", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "introduction" },
      snap({ outline: "A".repeat(50), currentPhase: 2 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/generate_writing_blueprint/);
  });

  it("blocks write_section without argument blueprint", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "introduction" },
      snap({
        outline: "A".repeat(50),
        currentPhase: 3,
        hasWritingBlueprint: true,
        hasArgumentBlueprint: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/build_argument_blueprint/);
  });

  it("allows write_section when outline + blueprints ready regardless of phase number", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "introduction" },
      snap({
        outline: "A".repeat(50),
        currentPhase: 2,
        hasWritingBlueprint: true,
        hasArgumentBlueprint: true,
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("allows generate_outline without existing outline", () => {
    expect(checkAgentToolPhaseGate("generate_outline", {}, snap()).ok).toBe(true);
  });

  it("blocks generate_writing_blueprint without outline", () => {
    const r = checkAgentToolPhaseGate("generate_writing_blueprint", {}, snap());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/generate_outline/);
  });

  it("blocks abstract before body draft", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "abstract" },
      snap({
        outline: "A".repeat(50),
        currentPhase: 4,
        hasWritingBlueprint: true,
        hasArgumentBlueprint: true,
        sectionFills: [{ key: "introduction", chars: 10 }],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/摘要/);
  });

  it("allows abstract when body exists", () => {
    const r = checkAgentToolPhaseGate(
      "write_section",
      { section: "abstract" },
      snap({
        outline: "A".repeat(50),
        currentPhase: 6,
        hasWritingBlueprint: true,
        hasArgumentBlueprint: true,
        sectionFills: [{ key: "introduction", chars: 200 }],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("blocks argument blueprint without outline", () => {
    const r = checkAgentToolPhaseGate("build_argument_blueprint", {}, snap());
    expect(r.ok).toBe(false);
  });

  it("blocks bilingual abstract without body", () => {
    const r = checkAgentToolPhaseGate(
      "write_bilingual_abstract",
      {},
      snap({ outline: "A".repeat(50), sectionFills: [] }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("resolvePhaseTaskPack", () => {
  it("returns drafting goal with empty section", () => {
    const r = resolvePhaseTaskPack(
      snap({
        currentPhase: 4,
        sectionFills: [
          { key: "introduction", chars: 0 },
          { key: "literature_body", chars: 0 },
        ],
      }),
    );
    expect(r.pack.phase).toBe(4);
    expect(r.goal).toMatch(/introduction|引言/);
  });

  it("phase 2 prefers generate_outline tools", () => {
    const pack = getPhaseTaskPack(2);
    expect(pack.preferredTools).toContain("generate_outline");
    expect(pack.preferredTools).toContain("generate_writing_blueprint");
  });

  it("exposes pack titles for all phases", () => {
    for (let i = 0; i <= 7; i++) {
      expect(getPhaseTaskPack(i).title.length).toBeGreaterThan(0);
    }
  });
});

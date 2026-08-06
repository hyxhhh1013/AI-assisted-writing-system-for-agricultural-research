import { describe, expect, it } from "vitest";
import { getPhaseJumpTargets, resolveJumpHref } from "@academic-paper-studio/flow";

describe("workbench-bridge shallow links", () => {
  it("maps drafting to writing / structure / data / plot", () => {
    const targets = getPhaseJumpTargets(4, "proj_1");
    expect(targets.map((t) => t.id)).toEqual([
      "draft-writing",
      "draft-structure",
      "draft-data",
      "draft-plot",
    ]);
    expect(targets[0].href).toContain("tab=writing");
    expect(targets[3].href).toContain("/plot?id=");
  });

  it("maps skill phase 6 review to plagiarism, not abstract", () => {
    const targets = getPhaseJumpTargets(6, "p");
    expect(targets[0].href).toContain("tab=plagiarism");
    expect(targets.some((t) => t.href.includes("section=abstract"))).toBe(false);
  });

  it("maps 5b abstract separately from 5a citations", () => {
    const a = getPhaseJumpTargets(5, "p", "5a");
    const b = getPhaseJumpTargets(5, "p", "5b");
    expect(a[0].href).toContain("tab=reader");
    expect(b[0].href).toContain("section=abstract");
  });

  it("maps research phase to search import + write-while-drafting", () => {
    const targets = getPhaseJumpTargets(1, "proj_1");
    expect(targets.map((t) => t.id)).toEqual([
      "lit-search",
      "lit-write-first",
      "lit-knowledge",
    ]);
    expect(targets[0].href).toContain("tab=reader");
    expect(targets[1].href).toContain("tab=writing");
  });

  it("blocks auth jumps until project bound", () => {
    const targets = getPhaseJumpTargets(1, null);
    expect(resolveJumpHref(targets[0].href, null)).toBeNull();
    expect(resolveJumpHref(targets[0].href, "abc")).toContain("id=abc");
  });

  it("opens meta with structure tab for phase 0", () => {
    const targets = getPhaseJumpTargets(0, "x");
    expect(targets[0].href).toContain("meta=1");
    expect(targets[0].href).toContain("tab=structure");
  });
});

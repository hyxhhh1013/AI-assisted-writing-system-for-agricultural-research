import { describe, expect, it } from "vitest";
import { checkReadBeforeWrite } from "@/lib/agent/core/read-before-write";
import type { ToolObservation } from "@/lib/agent/types";

const ok = (tool: string): ToolObservation => ({ tool, success: true });

describe("read-before-write gate", () => {
  it("blocks introduction write with empty history", () => {
    const r = checkReadBeforeWrite(
      "write_section",
      { section: "introduction" },
      [],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/先取上下文/);
  });

  it("allows introduction write after inspect", () => {
    const r = checkReadBeforeWrite(
      "write_section",
      { section: "introduction" },
      [ok("inspect_project")],
    );
    expect(r.ok).toBe(true);
  });

  it("allows methods without prior read (not gated)", () => {
    const r = checkReadBeforeWrite(
      "write_section",
      { section: "methods" },
      [],
    );
    expect(r.ok).toBe(true);
  });

  it("blocks discussion refine without context", () => {
    const r = checkReadBeforeWrite(
      "refine_content",
      { section: "discussion" },
      [ok("generate_outline")],
    );
    expect(r.ok).toBe(false);
  });

  it("allows discussion after list_references", () => {
    const r = checkReadBeforeWrite(
      "refine_content",
      { section: "discussion" },
      [ok("list_references")],
    );
    expect(r.ok).toBe(true);
  });

  it("does not count failed context attempts", () => {
    const r = checkReadBeforeWrite(
      "write_section",
      { section: "introduction" },
      [{ tool: "inspect_project", success: false, error: "超时" }],
    );
    expect(r.ok).toBe(false);
  });
});

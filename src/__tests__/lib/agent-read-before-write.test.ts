import { describe, expect, it } from "vitest";
import { checkReadBeforeWrite } from "@/lib/agent/core/read-before-write";

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
      ["[inspect_project] 缺文献"],
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
      ["[generate_outline] ok"],
    );
    expect(r.ok).toBe(false);
  });

  it("allows discussion after list_references", () => {
    const r = checkReadBeforeWrite(
      "refine_content",
      { section: "discussion" },
      ["[list_references] 5 条"],
    );
    expect(r.ok).toBe(true);
  });
});

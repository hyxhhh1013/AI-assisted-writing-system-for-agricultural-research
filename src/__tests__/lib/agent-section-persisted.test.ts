import { describe, expect, it } from "vitest";
import { extractSectionPersisted } from "@/lib/agent/section-persisted";

describe("extractSectionPersisted", () => {
  it("parses write_section persisted payload", () => {
    const info = extractSectionPersisted("write_section", {
      success: true,
      data: {
        section: "introduction",
        charCount: 1200,
        persisted: { sectionKey: "introduction", referencesAdded: 2 },
      },
    });
    expect(info).toEqual({
      sectionKey: "introduction",
      tool: "write_section",
      charCount: 1200,
      referencesAdded: 2,
    });
  });

  it("returns null when not persisted", () => {
    expect(
      extractSectionPersisted("write_section", {
        success: true,
        data: { section: "introduction", persisted: null },
      }),
    ).toBeNull();
  });

  it("ignores unrelated tools", () => {
    expect(
      extractSectionPersisted("search_knowledge", {
        success: true,
        data: { persisted: { sectionKey: "introduction" } },
      }),
    ).toBeNull();
  });
});

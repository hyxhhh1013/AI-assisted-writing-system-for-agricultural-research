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

  it("parses apply_revision_item persisted payload", () => {
    const info = extractSectionPersisted("apply_revision_item", {
      success: true,
      data: {
        section: "discussion",
        charCount: 800,
        persisted: { sectionKey: "discussion", referencesAdded: 0 },
      },
    });
    expect(info).toEqual({
      sectionKey: "discussion",
      tool: "apply_revision_item",
      charCount: 800,
      referencesAdded: 0,
    });
  });

  it("maps write_bilingual_abstract to abstract", () => {
    const info = extractSectionPersisted("write_bilingual_abstract", {
      success: true,
      data: { persisted: true, zhChars: 240 },
    });
    expect(info).toEqual({
      sectionKey: "abstract",
      tool: "write_bilingual_abstract",
      charCount: 240,
    });
  });
});

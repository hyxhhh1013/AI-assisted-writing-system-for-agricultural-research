import { describe, expect, it } from "vitest";
import { citeYear, groupCiteContextsBySection, shortCiteTitle } from "@/lib/cite-inspect";

describe("cite-inspect helpers", () => {
  it("prefers API title over the raw bibliography string", () => {
    expect(
      shortCiteTitle("Zhu et al. Long citation[J]. Frontiers, 2024.", "Optimizing tobacco quality"),
    ).toBe("Optimizing tobacco quality");
  });

  it("pulls the article title from a GB/T style citation", () => {
    expect(
      shortCiteTitle(
        "Ruixuan Zhu et al. Optimizing tobacco quality and yield[J]. Frontiers in Plant Science, 2024.",
      ),
    ).toBe("Optimizing tobacco quality and yield");
  });

  it("extracts a publication year", () => {
    expect(citeYear("Frontiers in Plant Science, 2024, 15: 1500544.")).toBe("2024");
  });

  it("groups in-text hits by section, keeping first-seen order", () => {
    const groups = groupCiteContextsBySection([
      { sectionLabel: "引言", snippet: "a[6]" },
      { sectionLabel: "结论", snippet: "b[6]" },
      { sectionLabel: "引言", snippet: "c[6]" },
    ]);
    expect(groups).toEqual([
      { sectionLabel: "引言", snippets: ["a[6]", "c[6]"] },
      { sectionLabel: "结论", snippets: ["b[6]"] },
    ]);
  });
});

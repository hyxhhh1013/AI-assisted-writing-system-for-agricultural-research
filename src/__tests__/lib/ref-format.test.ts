import { describe, expect, it, vi } from "vitest";
import { parseLabPdfFilename } from "@/lib/lab-pdf-filename";
import { formatReference } from "@/lib/ref-format";

vi.mock("@/lib/rag", () => ({
  resolveBibEntry: () => undefined,
  cleanSourceName: (raw: string) =>
    raw.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim(),
}));

describe("parseLabPdfFilename", () => {
  it("parses numbered year-author-title PDFs and space-normalized names", () => {
    expect(parseLabPdfFilename("8-2021-罗伟-高岭土作为低密度聚乙烯催化热解催化剂的可重复利用性研究.pdf")).toEqual({
      year: "2021",
      author: "罗伟",
      title: "高岭土作为低密度聚乙烯催化热解催化剂的可重复利用性研究",
    });
    expect(parseLabPdfFilename("8 2021 罗伟 高岭土作为低密度聚乙烯催化热解催化剂的可重复利用性研究")).toMatchObject({
      year: "2021",
      author: "罗伟",
    });
    expect(parseLabPdfFilename("2018 yang 高岭土通过不同的机制提高生物炭的可溶性和不溶性组分的稳定性")).toMatchObject({
      year: "2018",
      author: "yang",
    });
  });
});

describe("formatReference lab PDF fallback", () => {
  it("emits GB/T author.title[J]. year. instead of serial year name soup", () => {
    const line = formatReference(
      "8 2021 罗伟 高岭土作为低密度聚乙烯催化热解催化剂的可重复利用性研究",
    );
    expect(line).toBe(
      "罗伟. 高岭土作为低密度聚乙烯催化热解催化剂的可重复利用性研究[J]. 2021.",
    );
    expect(line).not.toMatch(/^8 /);
  });

  it("passes through already formatted GB/T lines", () => {
    const raw =
      "Hassan HMI, Lin J. Recent progress[J]. Bioresource Technology, 2016, 221: 645. DOI: 10.1016/j.biortech.2016.09.026";
    expect(formatReference(raw)).toBe(raw);
  });
});

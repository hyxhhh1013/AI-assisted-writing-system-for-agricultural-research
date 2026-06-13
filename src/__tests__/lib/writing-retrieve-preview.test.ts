import { describe, it, expect } from "vitest";
import { buildRetrievePreviewFromChunks } from "@/services/writing-context";
import type { RagChunk } from "@/lib/rag";
import { retrievePreviewSchema } from "@/lib/validations";

function makeChunk(source: string, content: string, category = "papers"): RagChunk {
  return {
    content,
    metadata: { source, category, id: `${source}-0` },
  };
}

describe("buildRetrievePreviewFromChunks", () => {
  it("groups chunks by source and marks new vs existing refs", () => {
    const chunks = [
      makeChunk("a.pdf", "First chunk about biochar yield trends in soil."),
      makeChunk("a.pdf", "Second chunk with more detail."),
      makeChunk("b.pdf", "Novel pyrolysis temperature effects on bio-oil."),
    ];

    const preview = buildRetrievePreviewFromChunks(chunks, ["a.pdf"], "query text");

    expect(preview.hitCount).toBe(2);
    // 新文献优先排序（isNew），便于用户默认勾选待加入参考文献的来源
    expect(preview.defaultSelectedSourceIds).toEqual(["b.pdf", "a.pdf"]);

    const existing = preview.hits.find((h) => h.sourceKey === "a.pdf");
    const novel = preview.hits.find((h) => h.sourceKey === "b.pdf");

    expect(existing?.refIndex).toBe(1);
    expect(existing?.isNew).toBe(false);
    expect(existing?.chunkCount).toBe(2);

    expect(novel?.refIndex).toBeNull();
    expect(novel?.isNew).toBe(true);
    expect(novel?.chunkCount).toBe(1);
  });
});

describe("retrievePreviewSchema", () => {
  const readyBullets = [
    "研究背景与生物炭应用现状说明",
    "实验设计与主要处理方法说明",
    "预期结果与讨论方向要点说明",
  ];

  it("rejects empty draft", () => {
    const bad = retrievePreviewSchema.safeParse({
      title: "Test",
      section: "introduction",
      context: "",
      bullets: [],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts legacy context-only preview request", () => {
    const ok = retrievePreviewSchema.safeParse({
      title: "Test",
      section: "introduction",
      context: "研究背景与要点说明，至少若干字。".repeat(4),
    });
    expect(ok.success).toBe(true);
  });

  it("accepts bullets-based preview request", () => {
    const ok = retrievePreviewSchema.safeParse({
      title: "Test",
      section: "introduction",
      bullets: readyBullets,
    });
    expect(ok.success).toBe(true);
  });
});

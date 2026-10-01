import { describe, expect, it } from "vitest";
import type { MechanismSpecV1 } from "@/contracts/mechanism-spec";
import {
  compileIllustrationPrompt,
  compileIllustrationPromptFromParts,
} from "@/lib/illustration-prompt";

const spec: MechanismSpecV1 = {
  version: 1,
  kind: "flow",
  claim: "酸位主导脱水",
  caption: "生物油脱氧路径示意图",
  journal: { preset: "agr_journal" },
  layout: "fork",
  layoutLocked: true,
  visibleText: ["含氧前体", "脱水"],
  graph: {
    nodes: [
      { id: "a", label: "含氧前体", role: "start_end" },
      { id: "b", label: "脱水", role: "process" },
      { id: "c", label: "脱氧产物", role: "start_end" },
    ],
    edges: [{ from: "a", to: "b", label: "分子筛酸位" }, { from: "b", to: "c" }],
  },
  source: { flowSteps: ["含氧前体", "脱水", "脱氧产物"] },
};

describe("compileIllustrationPrompt", () => {
  it("embeds every visible label and forbids extra pathways", () => {
    const p = compileIllustrationPrompt(spec);
    expect(p.version).toBe(1);
    expect(p.prompt).toContain("含氧前体");
    expect(p.prompt).toContain("分子筛酸位");
    expect(p.prompt).toContain("Do not invent extra steps");
    expect(p.negativePrompt).toContain("watermark");
  });

  it("keeps override-free parts compiler stable", () => {
    const p = compileIllustrationPromptFromParts({
      claim: "x",
      caption: "y",
      visibleText: ["节点甲", "节点甲"],
    });
    expect(p.visibleText).toEqual(["节点甲"]);
  });
});

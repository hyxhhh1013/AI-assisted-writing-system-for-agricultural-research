import { describe, expect, it } from "vitest";
import { parseMechanismSpec } from "@/contracts/mechanism-spec";
import {
  buildAlternateLayoutSpec,
  compileMechanismSpec,
  inspectMechanismSpec,
  mechanismSpecToRenderConfig,
  splitNodeCondition,
} from "@/lib/mechanism-spec-compiler";
import { applyMechanismSpecPatches } from "@/lib/mechanism-spec-patches";
import { refinePlotFlow, refinePlotPanelConfig } from "@/lib/mechanism-spec-run";

describe("MechanismSpec compiler", () => {
  it("lifts parenthetical conditions onto incoming edges", () => {
    const { spec, qaReport } = compileMechanismSpec({
      kind: "flow",
      title: "生物质催化热解框架",
      layout: "chain",
      flowSteps: [
        "生物质原料（秸秆/林余）",
        "催化热解（约500℃，原位）",
        "碳流分配",
        "高值产物",
      ],
    });
    expect(spec.graph?.nodes.map((n) => n.label)).toEqual([
      "生物质原料",
      "催化热解",
      "碳流分配",
      "高值产物",
    ]);
    expect(spec.graph?.edges.find((e) => e.to === "2")?.label).toBe("约500℃，原位");
    expect(spec.visibleText).toContain("约500℃，原位");
    expect(spec.visibleText).not.toContain(spec.claim);
    expect(qaReport.verdict).not.toBe("block");
  });

  it("splitNodeCondition keeps bare phrases", () => {
    expect(splitNodeCondition("脱水")).toEqual({ label: "脱水" });
    expect(splitNodeCondition("催化热解（约500℃）")).toEqual({
      label: "催化热解",
      condition: "约500℃",
    });
  });

  it("blocks English placeholders and patches them to Chinese", () => {
    const { spec, findings } = compileMechanismSpec({
      kind: "flow",
      title: "转化路径",
      layout: "chain",
      flowSteps: ["Feedstock", "Pathway", "Product"],
    });
    expect(findings.some((f) => f.code === "english_placeholder" && f.action === "block")).toBe(
      true,
    );
    const patched = applyMechanismSpecPatches(spec, findings);
    expect(patched.patches.length).toBeGreaterThan(0);
    expect(patched.spec.graph?.nodes.map((n) => n.label).join(" ")).not.toMatch(
      /Feedstock|Pathway|Product/,
    );
    expect(inspectMechanismSpec(patched.spec).some((f) => f.code === "english_placeholder")).toBe(
      false,
    );
  });

  it("moves a pasted claim off the node", () => {
    const claim = "酸位主导脱水脱羧从而降低氧含量";
    const { spec, findings } = compileMechanismSpec({
      kind: "flow",
      title: "脱氧",
      claim,
      layout: "chain",
      flowSteps: [claim, "脱氧产物"],
    });
    expect(findings.some((f) => f.code === "claim_on_figure")).toBe(true);
    const patched = applyMechanismSpecPatches(spec, findings);
    expect(patched.spec.graph?.nodes.some((n) => n.label === claim)).toBe(false);
    expect(patched.spec.claim).toBe(claim);
  });

  it("offers the other layout when ≥4 steps and layout is unlocked", () => {
    const { spec } = compileMechanismSpec({
      kind: "flow",
      title: "框架",
      flowSteps: ["原料", "热解", "酸位调控", "碳流分配", "产物"],
    });
    expect(spec.layout).toBe("fork");
    expect(spec.layoutLocked).toBe(false);
    const alt = buildAlternateLayoutSpec(spec);
    expect(alt?.layout).toBe("chain");
    expect(alt?.graph?.edges.some((e) => e.from === "2" && e.to === "3")).toBe(true);
    expect(alt?.graph?.edges).toHaveLength(4);
  });

  it("does not offer an alternate when the user locked layout", () => {
    const { spec } = compileMechanismSpec({
      kind: "flow",
      title: "框架",
      layout: "chain",
      flowSteps: ["原料", "热解", "调控", "产物"],
    });
    expect(spec.layoutLocked).toBe(true);
    expect(buildAlternateLayoutSpec(spec)).toBeNull();
  });

  it("mechanism_panel config stays flow_subgraph with extracted edge labels", () => {
    const { spec } = compileMechanismSpec({
      kind: "mechanism_panel",
      title: "脱氧与芳构化",
      layout: "chain",
      panels: [
        {
          title: "脱氧",
          steps: ["含氧前体", "脱水（酸位）", "脱羧", "脱氧产物"],
        },
        {
          title: "芳构化",
          steps: ["烯烃", "环化", "芳烃"],
        },
      ],
    });
    const cfg = mechanismSpecToRenderConfig(spec);
    const panels = cfg.panels as Array<{
      blocks: Array<{ type: string; edges?: Array<{ label?: string }> }>;
    }>;
    expect(panels).toHaveLength(2);
    const flow0 = panels[0]?.blocks.find((b) => b.type === "flow_subgraph");
    expect(flow0?.edges?.some((e) => e.label === "酸位")).toBe(true);
  });

  it("refinePlotFlow keeps topology and lifts conditions for /plot", () => {
    const refined = refinePlotFlow({
      title: "热解",
      nodes: [
        { id: "a", label: "原料", role: "start_end", color: "#111" },
        { id: "b", label: "催化热解（约500℃）", role: "process" },
        { id: "c", label: "产物", role: "start_end" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });
    expect(refined).not.toBeNull();
    expect(refined?.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(refined?.nodes.find((n) => n.id === "b")?.label).toBe("催化热解");
    expect(refined?.nodes.find((n) => n.id === "a")?.color).toBe("#111");
    expect(refined?.edges.find((e) => e.to === "b")?.label).toBe("约500℃");
  });

  it("refinePlotPanelConfig patches subgraphs and keeps extra blocks", () => {
    const { config, qaReport } = refinePlotPanelConfig({
      title: "两栏",
      preset: "nature",
      panels: [
        {
          id: "a",
          title: "脱氧",
          blocks: [
            { type: "text", content: "酸位" },
            {
              type: "flow_subgraph",
              nodes: [
                { id: "1", label: "前体" },
                { id: "2", label: "脱水（酸位）" },
              ],
              edges: [{ from: "1", to: "2" }],
            },
          ],
        },
        {
          id: "b",
          title: "产物",
          blocks: [
            {
              type: "flow_subgraph",
              nodes: [
                { id: "1", label: "中间体" },
                { id: "2", label: "产物" },
              ],
              edges: [{ from: "1", to: "2" }],
            },
            { type: "callout", content: "择形" },
          ],
        },
      ],
    });
    const panels = config.panels as Array<{
      blocks: Array<{ type: string; content?: string; edges?: Array<{ label?: string }> }>;
    }>;
    expect(panels[0]?.blocks[0]?.type).toBe("text");
    expect(panels[1]?.blocks[1]?.type).toBe("callout");
    const flow0 = panels[0]?.blocks.find((b) => b.type === "flow_subgraph");
    expect(flow0?.edges?.some((e) => e.label === "酸位")).toBe(true);
    expect(qaReport.verdict).not.toBe("block");
  });

  it("parseMechanismSpec round-trips a compiled flow", () => {
    const { spec } = compileMechanismSpec({
      kind: "flow",
      title: "双路径",
      layout: "chain",
      flowSteps: ["原料", "转化", "产物"],
    });
    const again = parseMechanismSpec(spec);
    expect(again?.graph?.nodes).toHaveLength(3);
    expect(again?.caption).toBe(spec.caption);
  });
});

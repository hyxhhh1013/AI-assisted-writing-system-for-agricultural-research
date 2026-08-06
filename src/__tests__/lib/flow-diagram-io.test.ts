/** Flow ↔ Mermaid / DOT 互转单测 */

import { describe, expect, it } from "vitest";
import { flowToDot, flowToMermaid, mermaidToFlow } from "@/lib/flow-diagram-io";

describe("flow-diagram-io", () => {
  const nodes = [
    { id: "1", label: "Feedstock", role: "start_end" as const },
    { id: "2", label: "Reaction", role: "process" as const },
    { id: "3", label: "OK?", role: "decision" as const },
  ];
  const edges = [
    { from: "1", to: "2" },
    { from: "2", to: "3", label: "T,P" },
  ];

  it("exports mermaid flowchart", () => {
    const m = flowToMermaid(nodes, edges, "vertical");
    expect(m).toContain("flowchart TD");
    expect(m).toContain("1((Feedstock))");
    expect(m).toContain("3{OK?}");
    expect(m).toContain("2 -->|T,P| 3");
  });

  it("exports dot", () => {
    const d = flowToDot(nodes, edges, { title: "Demo", direction: "vertical" });
    expect(d).toContain("digraph G");
    expect(d).toContain('shape=ellipse');
    expect(d).toContain('shape=diamond');
    expect(d).toContain('"2" -> "3"');
  });

  it("round-trips simple mermaid", () => {
    const src = `flowchart TD
  A((Start)) --> B[Step]
  B -->|yes| C{Gate}
  C --> D((End))`;
    const parsed = mermaidToFlow(src);
    expect(parsed.direction).toBe("vertical");
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(4);
    expect(parsed.edges.length).toBe(3);
    const again = flowToMermaid(parsed.nodes, parsed.edges, parsed.direction);
    expect(again).toContain("flowchart TD");
  });
});

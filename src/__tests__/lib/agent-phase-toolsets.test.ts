import { describe, expect, it } from "vitest";
import { PHASE_TASK_PACKS } from "@/contracts/phase-task-pack";
import {
  ALWAYS_ON_TOOLS,
  PHASE_TOOLSETS,
  toolsForPhase,
  type AgentPhaseId,
} from "@/contracts/agent-phase";
import { createAgentTools } from "@/lib/agent/core/agent-loop";

/** 旧任务包仍写着、新工具集故意不给的工具 */
const PREFERRED_EXCEPTIONS: Record<number, readonly string[]> = {
  2: ["search_knowledge"],
};

function phaseIdForPack(phase: number): AgentPhaseId {
  if (phase <= 0) return "config";
  if (phase === 1) return "literature";
  if (phase === 2 || phase === 3) return "outline";
  if (phase === 4) return "draft";
  if (phase === 5) return "citation";
  if (phase === 6) return "abstract";
  return "review";
}

describe("PHASE_TOOLSETS", () => {
  it("注册表里每个工具至少出现在一个阶段或常驻集合", () => {
    const covered = new Set<string>(ALWAYS_ON_TOOLS);
    for (const spec of Object.values(PHASE_TOOLSETS)) {
      for (const name of spec.tools) covered.add(name);
      for (const extra of Object.values(spec.byMode ?? {})) {
        for (const name of extra) covered.add(name);
      }
    }
    const missing = createAgentTools()
      .map((tool) => tool.name)
      .filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  it("工具集无重复，且都在注册表里", () => {
    const registered = new Set(createAgentTools().map((tool) => tool.name));
    for (const phase of Object.keys(PHASE_TOOLSETS) as AgentPhaseId[]) {
      for (const mode of [undefined, "review", "research"] as const) {
        const names = toolsForPhase(phase, mode);
        expect(names).toEqual([...new Set(names)]);
        for (const name of names) expect(registered.has(name)).toBe(true);
      }
    }
  });

  it("旧任务包推荐工具都落在对应阶段工具集里（大纲检索除外）", () => {
    for (const pack of Object.values(PHASE_TASK_PACKS)) {
      const allowed = new Set([
        ...toolsForPhase(phaseIdForPack(pack.phase)),
        ...toolsForPhase(phaseIdForPack(pack.phase), "review"),
      ]);
      const skip = new Set(PREFERRED_EXCEPTIONS[pack.phase] ?? []);
      const missing = pack.preferredTools.filter((name) => !skip.has(name) && !allowed.has(name));
      expect(missing, `phase ${pack.phase}`).toEqual([]);
    }
  });

  it("综述起草可以检索导入，研究型起草不可以", () => {
    const review = toolsForPhase("draft", "review");
    const research = toolsForPhase("draft", "research");
    expect(review).toContain("search_knowledge");
    expect(review).toContain("import_reference");
    expect(research).not.toContain("search_knowledge");
    expect(research).not.toContain("import_reference");
    expect(toolsForPhase("outline")).not.toContain("search_knowledge");
  });
});

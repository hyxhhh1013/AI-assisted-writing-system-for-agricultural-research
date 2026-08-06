import { END, START, StateGraph } from "@langchain/langgraph";
import { agentNode, finalizeNode, planNode, reflectNode, toolsNode } from "@/lib/agent/langgraph/nodes";
import { AgentGraphState, routeAfterAgent, routeAfterReflect } from "@/lib/agent/langgraph/state";

let compiledGraph: ReturnType<typeof buildAgentGraph> | null = null;

export function buildAgentGraph() {
  const graph = new StateGraph(AgentGraphState)
    .addNode("plan_step", planNode)
    .addNode("agent_step", agentNode)
    .addNode("tools_step", toolsNode)
    .addNode("reflect_step", reflectNode)
    .addNode("finalize_step", finalizeNode)
    .addEdge(START, "plan_step")
    .addEdge("plan_step", "agent_step")
    .addConditionalEdges("agent_step", routeAfterAgent, {
      tools: "tools_step",
      agent: "agent_step",
      reflect: "reflect_step",
      finalize: "finalize_step",
    })
    .addEdge("tools_step", "agent_step")
    .addConditionalEdges("reflect_step", routeAfterReflect, {
      agent: "agent_step",
      finalize: "finalize_step",
    })
    .addEdge("finalize_step", END);

  return graph.compile();
}

export function getCompiledAgentGraph() {
  if (!compiledGraph) {
    compiledGraph = buildAgentGraph();
  }
  return compiledGraph;
}

/** @internal vitest */
export function resetCompiledAgentGraphForTests(): void {
  compiledGraph = null;
}

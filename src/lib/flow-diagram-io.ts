/** Flow 图 ↔ Mermaid / DOT 互转（对照 Kroki 多引擎思路，本地无服务依赖） */

export interface FlowIoNode {
  id: string;
  label: string;
  shape?: "box" | "oval" | "diamond";
  role?: "process" | "decision" | "start_end" | "callout";
  color?: string;
}

export interface FlowIoEdge {
  from: string;
  to: string;
  label?: string;
}

function escapeMermaidLabel(s: string): string {
  return s.replace(/[[\]{}|()]/g, " ").replace(/\s+/g, " ").trim();
}

function nodeShapeWrap(id: string, label: string, role?: string): string {
  const text = escapeMermaidLabel(label) || id;
  if (role === "decision") return `${id}{${text}}`;
  if (role === "start_end") return `${id}((${text}))`;
  if (role === "callout") return `${id}([${text}])`;
  return `${id}[${text}]`;
}

/** 导出 Mermaid flowchart（可贴进 Mermaid 卡或外发） */
export function flowToMermaid(
  nodes: FlowIoNode[],
  edges: FlowIoEdge[],
  direction: "vertical" | "horizontal" = "vertical",
): string {
  const dir = direction === "horizontal" ? "LR" : "TD";
  const lines = [`flowchart ${dir}`];
  for (const n of nodes) {
    if (!n.id) continue;
    lines.push(`  ${nodeShapeWrap(n.id, n.label || n.id, n.role)}`);
  }
  for (const e of edges) {
    if (!e.from || !e.to) continue;
    const lab = e.label?.trim();
    if (lab) {
      lines.push(`  ${e.from} -->|${escapeMermaidLabel(lab)}| ${e.to}`);
    } else {
      lines.push(`  ${e.from} --> ${e.to}`);
    }
  }
  return lines.join("\n");
}

/** 导出 Graphviz DOT（可对照 Graphviz / Kroki DOT 引擎） */
export function flowToDot(
  nodes: FlowIoNode[],
  edges: FlowIoEdge[],
  opts?: { title?: string; direction?: "vertical" | "horizontal" },
): string {
  const rankdir = opts?.direction === "horizontal" ? "LR" : "TB";
  const lines = [
    "digraph G {",
    `  rankdir=${rankdir};`,
    '  node [fontname="Helvetica"];',
  ];
  if (opts?.title?.trim()) {
    lines.push(`  labelloc="t"; label="${opts.title.replace(/"/g, '\\"')}";`);
  }
  for (const n of nodes) {
    if (!n.id) continue;
    const shape =
      n.role === "decision" || n.shape === "diamond"
        ? "diamond"
        : n.role === "start_end" || n.shape === "oval"
          ? "ellipse"
          : "box";
    const label = (n.label || n.id).replace(/"/g, '\\"');
    lines.push(`  "${n.id}" [label="${label}", shape=${shape}];`);
  }
  for (const e of edges) {
    if (!e.from || !e.to) continue;
    const lab = e.label?.trim();
    if (lab) {
      lines.push(`  "${e.from}" -> "${e.to}" [label="${lab.replace(/"/g, '\\"')}"];`);
    } else {
      lines.push(`  "${e.from}" -> "${e.to}";`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * 解析常见 Mermaid flowchart 子集（节点定义 + --> 边）。
 * 不支持 subgraph / 复杂样式；失败返回空图。
 */
export function mermaidToFlow(src: string): {
  nodes: FlowIoNode[];
  edges: FlowIoEdge[];
  direction: "vertical" | "horizontal";
} {
  const text = src.replace(/\r\n/g, "\n").trim();
  const direction: "vertical" | "horizontal" = /flowchart\s+LR|graph\s+LR/i.test(text)
    ? "horizontal"
    : "vertical";

  const nodeMap = new Map<string, FlowIoNode>();
  const edges: FlowIoEdge[] = [];

  const ensure = (id: string, label?: string, role?: FlowIoNode["role"]) => {
    const existing = nodeMap.get(id);
    if (existing) {
      if (label && (!existing.label || existing.label === id)) existing.label = label;
      if (role) existing.role = role;
      return;
    }
    const r = role || "process";
    nodeMap.set(id, {
      id,
      label: label || id,
      role: r,
      shape: r === "decision" ? "diamond" : r === "start_end" ? "oval" : "box",
    });
  };

  // A[Label] / A{Label} / A((Label)) / A([Label])
  const nodeRe =
    /\b([A-Za-z][\w]*)\s*(?:\[([^\]]*)\]|\{([^}]*)\}|\(\(([^)]*)\)\)|\(\[([^\]]*)\]\))/g;
  for (const m of text.matchAll(nodeRe)) {
    const id = m[1]!;
    if (m[2] !== undefined) ensure(id, m[2], "process");
    else if (m[3] !== undefined) ensure(id, m[3], "decision");
    else if (m[4] !== undefined) ensure(id, m[4], "start_end");
    else if (m[5] !== undefined) ensure(id, m[5], "callout");
  }

  // 去掉形状语法后再扫边，避免 A((Start)) --> B 漏匹配
  const cleaned = text.replace(
    /\b([A-Za-z][\w]*)\s*(?:\[[^\]]*\]|\{[^}]*\}|\(\([^)]*\)\)|\(\[[^\]]*\]\))/g,
    "$1",
  );

  // A -->|lab| B  or  A --> B  （Mermaid：箭头在标签前）
  const edgeRe =
    /\b([A-Za-z][\w]*)\s*-->\s*(?:\|([^|]*)\|\s*)?([A-Za-z][\w]*)/g;
  for (const m of cleaned.matchAll(edgeRe)) {
    const from = m[1]!;
    const to = m[3]!;
    const label = m[2]?.trim();
    ensure(from);
    ensure(to);
    edges.push(label ? { from, to, label } : { from, to });
  }

  return { nodes: [...nodeMap.values()], edges, direction };
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

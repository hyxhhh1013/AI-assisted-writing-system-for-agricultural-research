import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentTools, createReadOnlyTools } from "@/lib/agent/core/agent-loop";
import { toolDisplayName } from "@/lib/agent/ui-progress";
import {
  READ_TOOLS,
  UNREGISTERED_TOOL_FILES,
  WRITE_TOOLS,
} from "@/lib/agent/tools/registry";

const TOOLS_DIR = path.resolve(__dirname, "../../lib/agent/tools");
const TOOL_NAME_RE = /^\s*name:\s*"([a-z0-9_]+)"/m;

function extractToolName(file: string): string {
  const text = readFileSync(path.join(TOOLS_DIR, file), "utf8");
  const match = text.match(TOOL_NAME_RE);
  if (!match) {
    throw new Error(`${file} 未找到 name: "..."`);
  }
  return match[1];
}

describe("agent tool registry (W3-AP-ARCH-01)", () => {
  it("READ / WRITE 表无重名", () => {
    const names = [...READ_TOOLS, ...WRITE_TOOLS].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("createReadOnlyTools 与 READ_TOOLS 同序同名", () => {
    expect(createReadOnlyTools().map((t) => t.name)).toEqual(READ_TOOLS.map((t) => t.name));
  });

  it("tools/*.ts 要么挂表要么在弃用名单", () => {
    const registered = new Set([...READ_TOOLS, ...WRITE_TOOLS].map((t) => t.name));
    const unregistered = new Set<string>(UNREGISTERED_TOOL_FILES);
    const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".ts") && f !== "registry.ts");

    const missing: string[] = [];
    const unexpectedUnregistered: string[] = [];

    for (const file of files) {
      const name = extractToolName(file);
      if (unregistered.has(file)) {
        if (registered.has(name)) unexpectedUnregistered.push(`${file} (${name})`);
        continue;
      }
      if (!registered.has(name)) missing.push(`${file} → ${name}`);
    }

    expect(missing).toEqual([]);
    expect(unexpectedUnregistered).toEqual([]);
  });

  it("每个已挂载工具都有中文 UI 名（不能把 snake_case 甩给用户）", () => {
    const unlabeled = [...READ_TOOLS, ...WRITE_TOOLS]
      .map((t) => t.name)
      .filter((name) => toolDisplayName(name) === name);
    expect(unlabeled).toEqual([]);
  });

  it("弃用蓝图工具不进模型清单", () => {
    const prevAgent = process.env.AGENT_ENABLED;
    const prevWrite = process.env.AGENT_WRITE_ENABLED;
    process.env.AGENT_ENABLED = "1";
    process.env.AGENT_WRITE_ENABLED = "1";
    const names = createAgentTools().map((t) => t.name);
    expect(names).not.toContain("build_argument_blueprint");
    expect(names).toContain("generate_writing_blueprint");
    process.env.AGENT_ENABLED = prevAgent;
    process.env.AGENT_WRITE_ENABLED = prevWrite;
  });
});

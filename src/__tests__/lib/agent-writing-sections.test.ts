import { describe, expect, it } from "vitest";
import {
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";

describe("agent writing sections", () => {
  it("parsePersistToProject defaults to true", () => {
    expect(parsePersistToProject(undefined)).toBe(true);
    expect(parsePersistToProject("true")).toBe(true);
  });

  it("parsePersistToProject respects false", () => {
    expect(parsePersistToProject(false)).toBe(false);
    expect(parsePersistToProject("false")).toBe(false);
    expect(parsePersistToProject(0)).toBe(false);
  });

  it("isAgentWritingSectionKey validates section keys", () => {
    expect(isAgentWritingSectionKey("introduction")).toBe(true);
    expect(isAgentWritingSectionKey("invalid")).toBe(false);
  });
});

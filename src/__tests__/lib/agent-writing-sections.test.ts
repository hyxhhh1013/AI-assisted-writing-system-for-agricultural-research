import { describe, expect, it } from "vitest";
import {
  isAgentWritingSectionKey,
  parseBoolParam,
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
    expect(parsePersistToProject("0")).toBe(false);
  });

  it("parseBoolParam treats boolean false as false (LLM JSON)", () => {
    expect(parseBoolParam(false, true)).toBe(false);
    expect(parseBoolParam("false", true)).toBe(false);
    expect(parseBoolParam(undefined, true)).toBe(true);
    expect(parseBoolParam("", false)).toBe(false);
  });

  it("isAgentWritingSectionKey validates section keys", () => {
    expect(isAgentWritingSectionKey("introduction")).toBe(true);
    expect(isAgentWritingSectionKey("invalid")).toBe(false);
  });
});

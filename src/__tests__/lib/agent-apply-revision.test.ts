import { describe, expect, it } from "vitest";
import { mapSectionHintToKey } from "@/lib/agent/tools/apply-revision-item";

describe("mapSectionHintToKey", () => {
  it("maps common hints", () => {
    expect(mapSectionHintToKey("discussion")).toBe("discussion");
    expect(mapSectionHintToKey("引言")).toBe("introduction");
    expect(mapSectionHintToKey("Methods")).toBe("methods");
    expect(mapSectionHintToKey("lit review")).toBe("literature_body");
  });

  it("returns null for unknown", () => {
    expect(mapSectionHintToKey("whole")).toBeNull();
    expect(mapSectionHintToKey("")).toBeNull();
  });
});

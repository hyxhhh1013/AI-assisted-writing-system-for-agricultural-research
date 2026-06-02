import { describe, it, expect } from "vitest";
import {
  parseExpandedOutlineSections,
  serializeExpandedOutlineSections,
} from "@/contracts/project";

describe("expandedOutlineSections serialization", () => {
  it("round-trips task id arrays", () => {
    const ids = ["abc123", "def456"];
    expect(parseExpandedOutlineSections(serializeExpandedOutlineSections(ids))).toEqual(ids);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseExpandedOutlineSections("not-json")).toEqual([]);
    expect(parseExpandedOutlineSections(null)).toEqual([]);
  });
});

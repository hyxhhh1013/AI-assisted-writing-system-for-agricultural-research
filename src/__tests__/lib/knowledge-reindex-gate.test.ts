import { describe, expect, it } from "vitest";
import { reindexAdmission } from "@/lib/knowledge-reindex-gate";

describe("reindexAdmission", () => {
  it("attaches while a child is still running", () => {
    expect(reindexAdmission({
      childAlive: true,
      taskComplete: false,
      hasReconnectCursor: false,
    })).toBe("attach");
  });

  it("replays only when the client is reconnecting to a finished task", () => {
    expect(reindexAdmission({
      childAlive: false,
      taskComplete: true,
      hasReconnectCursor: true,
    })).toBe("replay");
  });

  it("starts a new job after the previous one finished", () => {
    expect(reindexAdmission({
      childAlive: false,
      taskComplete: true,
      hasReconnectCursor: false,
    })).toBe("start");
  });
});

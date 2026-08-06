import { describe, expect, it } from "vitest";
import {
  canEnterPhase,
  createStudioSession,
  confirmConfig,
  approveOutline,
} from "@academic-paper-studio/flow";

describe("academic-paper-studio checkpoints", () => {
  it("blocks phase 1 until config is confirmed", () => {
    const session = createStudioSession({
      mode: "full",
      phaseStatus: {
        0: "done",
        1: "ready",
        2: "locked",
        3: "locked",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      },
    });
    const gate = canEnterPhase(session, 1);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("配置记录");
  });

  it("allows phase 1 after config confirm", () => {
    const session = createStudioSession({
      mode: "full",
      phaseStatus: {
        0: "done",
        1: "ready",
        2: "locked",
        3: "locked",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      },
      checkpoints: confirmConfig(createStudioSession().checkpoints),
    });
    expect(canEnterPhase(session, 1).ok).toBe(true);
  });

  it("blocks phase 3 until outline approved", () => {
    const session = createStudioSession({
      mode: "full",
      phaseStatus: {
        0: "done",
        1: "done",
        2: "done",
        3: "ready",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      },
      checkpoints: {
        ...confirmConfig(createStudioSession().checkpoints),
        sourcesReviewed: true,
        outlineApproved: false,
      },
    });
    expect(canEnterPhase(session, 3).ok).toBe(false);
    const unlocked = {
      ...session,
      checkpoints: approveOutline(session.checkpoints),
    };
    expect(canEnterPhase(unlocked, 3).ok).toBe(true);
  });

  it("blocks format when critical issues remain", () => {
    const session = createStudioSession({
      mode: "full",
      phaseStatus: {
        0: "done",
        1: "done",
        2: "done",
        3: "done",
        4: "done",
        5: "done",
        6: "done",
        7: "ready",
      },
      checkpoints: {
        ...confirmConfig(createStudioSession().checkpoints),
        outlineApproved: true,
        sourcesReviewed: true,
        criticalIssuesBlocking: true,
        revisionRound: 1,
      },
    });
    expect(canEnterPhase(session, 7).ok).toBe(false);
  });
});

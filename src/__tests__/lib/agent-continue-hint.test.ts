import { describe, expect, it } from "vitest";
import type { AgentUiMessage } from "@/contracts/agent-session";
import {
  collectTurnContinueSignals,
  resolveAgentContinueHint,
  sectionKeyFromWriteTip,
} from "@/lib/agent/continue-hint";

describe("sectionKeyFromWriteTip", () => {
  it("maps 研究现状 to background", () => {
    expect(sectionKeyFromWriteTip("写研究现状并保存到当前项目")).toBe("background");
  });
});

describe("collectTurnContinueSignals", () => {
  it("ignores summary from the previous user turn", () => {
    const messages: AgentUiMessage[] = [
      { kind: "user", text: "开始吧" },
      {
        kind: "summary",
        summary: {
          text: "刚才只是口头说了要「撰写章节」，还没有真正执行。",
          toolCallCount: 0,
          keyFindings: [],
        },
      },
      { kind: "user", text: "写研究现状并保存到当前项目" },
      { kind: "thought", text: "现在撰写并保存 background 章节。" },
      {
        kind: "observation",
        tool: "write_section",
        summary: "已写回 background",
        sectionKey: "background",
      },
    ];
    const turn = collectTurnContinueSignals(messages);
    expect(turn.lastSummaryText).toBeNull();
    expect(turn.writtenSectionKeys).toEqual(["background"]);
    expect(turn.observations[0]?.success).toBe(true);
  });
});

describe("resolveAgentContinueHint", () => {
  it("uses announced write + suggested section as the real next step", () => {
    const hint = resolveAgentContinueHint({
      lastAssistantText: "撰写引言章节，对齐蓝图要点：",
      lastSummaryText: "刚才只是口头说了要「撰写章节」，还没有真正执行。",
      suggestedActions: [
        "看看项目卡在哪，建议下一步",
        "写研究现状并保存到当前项目",
      ],
    });
    expect(hint.eyebrow).toContain("还没执行");
    expect(hint.title).toBe("撰写研究现状");
    expect(hint.goal).toBe("写研究现状并保存到当前项目");
    expect(hint.cta).toBe("继续推进");
  });

  it("does not re-offer 研究现状 after this turn already wrote it", () => {
    const hint = resolveAgentContinueHint({
      lastAssistantText: "现在撰写并保存 background 章节。",
      lastSummaryText: "刚才只是口头说了要「撰写章节」，还没有真正执行。",
      suggestedActions: [
        "看看项目卡在哪，建议下一步",
        "写研究现状并保存到当前项目",
        "写综述正文并保存到当前项目",
      ],
      observations: [
        { tool: "write_section", success: true, sectionKey: "background" },
      ],
      skipSectionKeys: ["background"],
    });
    expect(hint.eyebrow).toBe("这一轮已写回");
    expect(hint.title).toBe("撰写综述正文");
    expect(hint.goal).toBe("写综述正文并保存到当前项目");
  });

  it("falls back to inspect when the only write tip is the section just written", () => {
    const hint = resolveAgentContinueHint({
      suggestedActions: ["写研究现状并保存到当前项目"],
      observations: [
        { tool: "write_section", success: true, sectionKey: "background" },
      ],
    });
    expect(hint.goal).toBe("看看项目卡在哪，建议下一步");
    expect(hint.eyebrow).toBe("这一轮已写回");
  });

  it("falls back to open plan task", () => {
    const hint = resolveAgentContinueHint({
      planSubtasks: [
        { title: "检索证据", status: "done" },
        { title: "按蓝图起草研究现状", status: "pending" },
      ],
    });
    expect(hint.eyebrow).toContain("计划");
    expect(hint.title).toBe("按蓝图起草研究现状");
    expect(hint.goal).toBe("继续");
  });

  it("skips a pending plan item for a section already written", () => {
    const hint = resolveAgentContinueHint({
      planSubtasks: [
        { title: "按蓝图起草研究现状", status: "pending" },
        { title: "写综述正文", status: "pending" },
      ],
      observations: [
        { tool: "write_section", success: true, sectionKey: "background" },
      ],
    });
    expect(hint.title).toBe("写综述正文");
    expect(hint.eyebrow).toContain("计划");
    expect(hint.goal).toBe("继续");
  });

  it("follows the running figure task instead of leftover「先写引言」", () => {
    const leftover =
      "conclusion 章节已写入但尚未自查。先做引用自查 validate_citations："
      + "——还有未完成步骤：生成图2并保存。你可以直接说「继续」或指定下一步（例如「先写引言」）。";
    const hint = resolveAgentContinueHint({
      lastAssistantText: leftover,
      lastSummaryText: leftover,
      planSubtasks: [
        { title: "核对项目资产", status: "done" },
        { title: "生成图2（分布趋势综合对比）并保存", status: "running" },
      ],
      suggestedActions: ["写综述正文并保存到当前项目（当前偏薄，建议扩写/补强）"],
    });
    expect(hint.eyebrow).toContain("计划");
    expect(hint.title).toContain("生成图2");
    expect(hint.goal).toBe("继续");
    expect(hint.eyebrow).not.toContain("还没执行");
  });

  it("uses write tip when nothing else is pending", () => {
    const hint = resolveAgentContinueHint({
      suggestedActions: ["写结论并保存到当前项目"],
    });
    expect(hint.title).toBe("撰写结论");
    expect(hint.goal).toBe("写结论并保存到当前项目");
  });

  it("generic follow-up when no signals", () => {
    const hint = resolveAgentContinueHint({});
    expect(hint.goal).toBe("继续");
    expect(hint.title).toBe("继续推进");
  });
});

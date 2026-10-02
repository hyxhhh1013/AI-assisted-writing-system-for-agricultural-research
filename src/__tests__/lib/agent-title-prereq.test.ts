import { describe, expect, it } from "vitest";
import {
  isPlaceholderPaperTitle,
  readTitlePrereqConsent,
  shouldAskTitleBeforeOutline,
} from "@/lib/agent/core/title-prereq-consent";

describe("title-prereq-consent", () => {
  it("treats unnamed projects as placeholder titles", () => {
    expect(isPlaceholderPaperTitle("")).toBe(true);
    expect(isPlaceholderPaperTitle("未命名论文")).toBe(true);
    expect(isPlaceholderPaperTitle("新文献综述")).toBe(true);
    expect(isPlaceholderPaperTitle("生物质热解催化转化制生物油")).toBe(false);
  });

  it("does not re-ask title once the project already has a real title", () => {
    expect(
      shouldAskTitleBeforeOutline({
        goal: "检索并导入相关文献",
        intentKind: "literature",
        title: "生物质热解制炭工艺与生物炭理化性质调控研究进展",
        observations: [{ tool: "import_reference", success: true }],
      }),
    ).toBe(false);
  });

  it("asks before outline after literature hunt even if title looks real", () => {
    expect(
      shouldAskTitleBeforeOutline({
        goal: "检索并导入相关文献",
        intentKind: "literature",
        title: "新综述",
        observations: [],
      }),
    ).toBe(true);
    expect(
      shouldAskTitleBeforeOutline({
        goal: "确认论文题目后生成大纲与写作蓝图并写回项目",
        intentKind: null,
        title: "新综述",
        observations: [],
      }),
    ).toBe(true);
    expect(
      shouldAskTitleBeforeOutline({
        goal: "生成大纲",
        intentKind: null,
        title: "生物质热解催化转化",
        observations: [],
      }),
    ).toBe(false);
  });

  it("reads keep / new title from user answer", () => {
    expect(
      readTitlePrereqConsent(
        [{ role: "user", content: "【用户回答】就用当前标题\n请据此继续" }],
        "已有题目",
      ),
    ).toEqual({ kind: "keep" });
    expect(
      readTitlePrereqConsent(
        [
          {
            role: "user",
            content: "【用户回答】生物质热解催化转化制生物油与化学品\n请据此继续",
          },
        ],
        "未命名论文",
      ),
    ).toMatchObject({
      kind: "title",
      title: "生物质热解催化转化制生物油与化学品",
    });
    expect(
      readTitlePrereqConsent(
        [{ role: "user", content: "【用户回答】已收到你的回复。请继续。" }],
        "未命名论文",
      ),
    ).toEqual({ kind: "unset" });
    expect(
      readTitlePrereqConsent(
        [{ role: "user", content: "【用户回答】已收到你的回复。请继续。" }],
        "生物质热解催化转化",
      ),
    ).toEqual({ kind: "keep" });
    expect(
      readTitlePrereqConsent(
        [{ role: "user", content: "【用户回答】你根据已有文献给我几个备选\n请据此继续" }],
        "生物质热解制炭工艺与生物炭理化性质调控研究进展",
      ),
    ).toEqual({ kind: "keep" });
  });
});

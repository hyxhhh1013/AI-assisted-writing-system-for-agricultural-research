import { describe, expect, it } from "vitest";
import { resolveAgentLastFailure } from "@/lib/agent/ui-failure";

describe("resolveAgentLastFailure", () => {
  it("hides the red box when the only error is an empty search", () => {
    expect(
      resolveAgentLastFailure({
        status: "error",
        messages: [
          {
            kind: "observation",
            tool: "search_external",
            error:
              "外部检索「biochar/pretreatment」无命中（源计数 全部失败）。可换英文关键词。",
          },
        ],
      }),
    ).toBeNull();
  });

  it("still surfaces a real tool error", () => {
    expect(
      resolveAgentLastFailure({
        status: "error",
        messages: [
          { kind: "observation", tool: "generate_outline", error: "项目不存在或无权访问" },
        ],
      }),
    ).toBe("项目不存在或无权访问");
  });

  it("hides the empty section-read loop warning", () => {
    expect(
      resolveAgentLastFailure({
        status: "error",
        messages: [
          {
            kind: "observation",
            tool: "read_section",
            error:
              "你已连续 4 次读取同一章节（不同窗口也算）。请停止空转读取：改用 part=\"tail\"、一次性读完整章节，或直接基于已有内容回复用户。",
          },
        ],
      }),
    ).toBeNull();
  });

  it("hides the citation-fix pipeline nudge", () => {
    expect(
      resolveAgentLastFailure({
        status: "error",
        messages: [
          {
            kind: "observation",
            tool: "write_bilingual_abstract",
            error:
              "academic-paper 流程·引用修正阶段：请先 read_section + refine_content 按报告改引写回，完成后再 write_bilingual_abstract。",
          },
        ],
      }),
    ).toBeNull();
  });

  it("is silent when the run completed", () => {
    expect(
      resolveAgentLastFailure({
        status: "completed",
        messages: [
          { kind: "observation", tool: "search_external", error: "无命中" },
        ],
      }),
    ).toBeNull();
  });
});

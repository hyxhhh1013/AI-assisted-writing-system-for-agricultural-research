/**
 * W3-AP-EVAL-SCRIPTS — 剧本轨迹断言（无 LLM，可进 CI）
 * @see docs/plans/W3-AP-BEHAVIOR.md
 */

import type {
  AgentScriptAssertionFail,
  AgentScriptCaseResult,
  AgentScriptId,
  AgentScriptToolStep,
  AgentScriptTrace,
} from "@/contracts/agent-eval-script";

const MAX_TOOLS_DEFAULT = 12;
const MAX_TOOLS_P4 = 16;

const GAP_HINT =
  /缺口|缺少|还没有|尚未|未完成|空白|建议|下一步|可以先|推荐/;
const NEXT_STEP_HINT =
  /下一步|建议|可以|先|生成大纲|写引言|导入|检索|配置|继续/;
const WRITEBACK_HINT = /已写回|字数|字符|chars?|\d+\s*字/;

function toolNames(tools: AgentScriptToolStep[]): string[] {
  return tools.map((t) => t.tool);
}

function firstIndex(tools: AgentScriptToolStep[], name: string): number {
  return tools.findIndex((t) => t.tool === name);
}

function countConsecutiveReadWindows(tools: AgentScriptToolStep[]): number {
  let max = 0;
  let cur = 0;
  let prevKey = "";
  for (const t of tools) {
    if (t.tool !== "read_section") {
      cur = 0;
      prevKey = "";
      continue;
    }
    const section = String(t.params?.section ?? "");
    const offset = String(t.params?.offset ?? t.params?.part ?? "0");
    const key = `${section}:${offset}`;
    if (key === prevKey) {
      cur += 1;
    } else {
      cur = 1;
      prevKey = key;
    }
    max = Math.max(max, cur);
  }
  return max;
}

function pushFail(
  fails: AgentScriptAssertionFail[],
  code: string,
  message: string,
) {
  fails.push({ code, message });
}

/** 断言单条轨迹；返回失败列表（空 = 通过） */
export function assertAgentScriptTrace(
  trace: AgentScriptTrace,
): AgentScriptAssertionFail[] {
  const fails: AgentScriptAssertionFail[] = [];
  const names = toolNames(trace.tools);
  const maxTools = trace.scriptId === "P4" ? MAX_TOOLS_P4 : MAX_TOOLS_DEFAULT;

  if (trace.tools.length > maxTools) {
    pushFail(
      fails,
      "budget",
      `toolCallCount=${trace.tools.length} 超过上限 ${maxTools}`,
    );
  }

  const readSpam = countConsecutiveReadWindows(trace.tools);
  if (readSpam > 2) {
    pushFail(
      fails,
      "read-spam",
      `同一 read_section 窗口连续 ${readSpam} 次（上限 2）`,
    );
  }

  switch (trace.scriptId) {
    case "P1":
      assertP1(trace, names, fails);
      break;
    case "P2":
      assertP2(trace, names, fails);
      break;
    case "P3":
      assertP3(trace, names, fails);
      break;
    case "P4":
      assertP4(trace, names, fails);
      break;
    case "P5":
      assertP5(trace, names, fails);
      break;
    case "P6":
      assertP6(trace, names, fails);
      break;
    default:
      pushFail(fails, "unknown-script", `未知剧本 ${trace.scriptId as string}`);
  }

  return fails;
}

function assertP1(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  if (!names.includes("inspect_project")) {
    pushFail(fails, "p1-inspect", "必须调用 inspect_project");
  }
  const firstWrite = Math.min(
    ...["write_section", "generate_outline"]
      .map((n) => firstIndex(trace.tools, n))
      .filter((i) => i >= 0),
  );
  const inspectAt = firstIndex(trace.tools, "inspect_project");
  if (
    Number.isFinite(firstWrite)
    && firstWrite >= 0
    && (inspectAt < 0 || firstWrite < inspectAt)
  ) {
    pushFail(
      fails,
      "p1-premature-write",
      "禁止在 inspect 之前 write_section / generate_outline",
    );
  }
  // 未征得同意的首轮禁止直接写/生成（整条轨迹也不该只有写）
  if (
    names[0] === "write_section"
    || names[0] === "generate_outline"
  ) {
    pushFail(fails, "p1-first-tool", "首个工具不能是 write_section / generate_outline");
  }
  const text = trace.finalText ?? "";
  if (!GAP_HINT.test(text)) {
    pushFail(fails, "p1-gap-text", "最终回复需含缺口/建议类语义");
  }
  if (!NEXT_STEP_HINT.test(text)) {
    pushFail(fails, "p1-next-step", "最终回复需含可执行下一步");
  }
}

function assertP2(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  const searchAt = firstIndex(trace.tools, "search_external");
  const importAt = firstIndex(trace.tools, "import_reference");
  if (searchAt < 0) {
    pushFail(fails, "p2-search", "必须调用 search_external");
  }
  if (importAt < 0) {
    pushFail(fails, "p2-import", "必须调用 import_reference");
  }
  if (searchAt >= 0 && importAt >= 0 && importAt < searchAt) {
    pushFail(fails, "p2-order", "import_reference 必须在 search_external 之后");
  }
  if (!trace.hadConfirm) {
    pushFail(fails, "p2-confirm", "必须出现 agent/confirm（人在环）");
  }

  const searchHitJsons = new Set<string>();
  for (const t of trace.tools) {
    if (t.tool !== "search_external" || !t.data?.items) continue;
    const items = t.data.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item && typeof item === "object" && "hitJson" in item) {
        searchHitJsons.add(String((item as { hitJson: unknown }).hitJson));
      }
    }
  }

  let importedPersisted = false;
  for (const t of trace.tools) {
    if (t.tool !== "import_reference") continue;
    const hitJson = t.params?.hitJson != null ? String(t.params.hitJson) : "";
    if (hitJson && searchHitJsons.size > 0 && !searchHitJsons.has(hitJson)) {
      pushFail(fails, "p2-fabricated-hit", "import 的 hitJson 必须来自 search_external 返回");
    }
    if (t.success && (t.data?.persisted === true || t.data?.persisted === "true")) {
      importedPersisted = true;
    }
  }
  if (!importedPersisted) {
    pushFail(fails, "p2-persisted", "最终 import_reference 需 persisted: true");
  }
  if (
    trace.referenceCountBefore != null
    && trace.referenceCountAfter != null
    && trace.referenceCountAfter <= trace.referenceCountBefore
  ) {
    pushFail(fails, "p2-refcount", "referenceCount 应增加");
  }
}

function assertP3(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  // 取最后一次成功的 introduction 写回（前面可能因缺蓝图被门禁拒绝）
  let writeAt = -1;
  for (let i = trace.tools.length - 1; i >= 0; i--) {
    const t = trace.tools[i]!;
    if (
      t.tool === "write_section"
      && String(t.params?.section ?? "").toLowerCase() === "introduction"
      && t.success !== false
    ) {
      const p = t.data?.persisted;
      const hasPersisted =
        p === true || p === "true" || (p != null && typeof p === "object");
      if (hasPersisted) {
        writeAt = i;
        break;
      }
    }
  }
  if (writeAt < 0) {
    const anyIntro = trace.tools.some(
      (t) =>
        t.tool === "write_section"
        && String(t.params?.section ?? "").toLowerCase() === "introduction",
    );
    pushFail(
      fails,
      anyIntro ? "p3-persisted" : "p3-write",
      anyIntro
        ? "write_section 需成功并带 persisted 写回标记"
        : "必须 write_section(section=introduction)",
    );
  }

  const contextTools = new Set([
    "inspect_project",
    "read_project_asset",
    "list_references",
    "read_section",
  ]);
  // 上下文：成功写回之前任意一次即可（含为补蓝图而做的读）
  const contextBefore =
    writeAt < 0
      ? false
      : trace.tools.slice(0, writeAt).some((t) => contextTools.has(t.tool));
  if (writeAt >= 0 && !contextBefore) {
    pushFail(fails, "p3-read-before-write", "写引言前须先读上下文（inspect/read/list）");
  }

  const text = trace.finalText ?? "";
  if (!WRITEBACK_HINT.test(text)) {
    pushFail(fails, "p3-final", "最终回复应说明已写回或字数");
  }
}

function assertP4(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  if (trace.goals.length < 2) {
    pushFail(fails, "p4-goals", "P4 需要至少两轮 goal");
    return;
  }

  // 用 goals 边界：轨迹不分段时，以「改道」后不应再写 results
  const redirectGoalIdx = trace.goals.findIndex((g) =>
    /先别写|改大纲|不要写/.test(g),
  );
  if (redirectGoalIdx < 0) {
    pushFail(fails, "p4-redirect-goal", "第二轮 goal 应含改道语义");
  }

  // 简化模型：tools 上标记 turn?: 1|2；若无标记则用「后半段不得写 results」
  const turns = trace.tools.map((t) =>
    typeof t.params?.__turn === "number" ? Number(t.params.__turn) : null,
  );
  const hasTurnMarks = turns.some((t) => t != null);

  if (hasTurnMarks) {
    const afterRedirect = trace.tools.filter((_, i) => turns[i] === 2);
    const wroteResultsAfter = afterRedirect.some(
      (t) =>
        t.tool === "write_section"
        && String(t.params?.section ?? "").toLowerCase() === "results",
    );
    if (wroteResultsAfter) {
      pushFail(fails, "p4-continue-results", "改道后不得继续 write_section(results)");
    }
  } else {
    // 无 turn 标记：若全程写完 results 且从未 generate_outline / checkpoint → 失败
    const wroteResults = names.includes("write_section")
      && trace.tools.some(
        (t) =>
          t.tool === "write_section"
          && String(t.params?.section ?? "").toLowerCase() === "results",
      );
    const redirected =
      names.includes("generate_outline")
      || Boolean(trace.hadOutlineCheckpoint)
      || /大纲/.test(trace.finalText ?? "");
    if (wroteResults && !redirected) {
      pushFail(
        fails,
        "p4-no-redirect",
        "改道后应 generate_outline / 大纲检查点 / 询问修改要点",
      );
    }
  }

  const redirectedOk =
    names.includes("generate_outline")
    || Boolean(trace.hadOutlineCheckpoint)
    || /大纲|怎么改|修改要点/.test(trace.finalText ?? "");
  if (!redirectedOk) {
    pushFail(
      fails,
      "p4-outline-path",
      "改道后须走向大纲（工具/检查点/询问）",
    );
  }
}

function assertP5(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  const parseAt = firstIndex(trace.tools, "parse_revision_comments");
  const applyAt = firstIndex(trace.tools, "apply_revision_item");
  if (parseAt < 0) {
    pushFail(fails, "p5-parse", "必须调用 parse_revision_comments");
  }
  if (applyAt < 0) {
    pushFail(fails, "p5-apply", "必须至少一次 apply_revision_item");
  }
  if (parseAt >= 0 && applyAt >= 0 && applyAt < parseAt) {
    pushFail(fails, "p5-order", "apply 须在 parse 之后");
  }

  const parseStep = parseAt >= 0 ? trace.tools[parseAt] : null;
  const roadmap = parseStep?.data?.items ?? parseStep?.data?.roadmap;
  if (parseStep && Array.isArray(roadmap) && roadmap.length === 0) {
    pushFail(fails, "p5-empty-roadmap", "修订路线图不能为空");
  }

  const appliedDiscussion = trace.tools.some(
    (t) =>
      t.tool === "apply_revision_item"
      && t.success !== false
      && (
        String(t.params?.section ?? "").toLowerCase() === "discussion"
        || String(t.data?.sectionKey ?? "").toLowerCase() === "discussion"
        || (t.data?.persisted
          && typeof t.data.persisted === "object"
          && String(
            (t.data.persisted as { sectionKey?: unknown }).sectionKey ?? "",
          ).toLowerCase() === "discussion")
      ),
  );
  const skippedPositive = /positive|跳过|无需修改/.test(trace.finalText ?? "");
  if (applyAt >= 0 && !appliedDiscussion && !skippedPositive) {
    pushFail(
      fails,
      "p5-discussion",
      "至少一条应写回 discussion，或说明跳过 positive",
    );
  }
}

function assertP6(
  trace: AgentScriptTrace,
  names: string[],
  fails: AgentScriptAssertionFail[],
) {
  void names;
  const xrdAt = firstIndex(trace.tools, "generate_xrd_analysis");
  if (xrdAt < 0) {
    pushFail(fails, "p6-xrd-tool", "必须调用 generate_xrd_analysis");
    return;
  }

  const xrdStep = trace.tools[xrdAt];
  const action = String(xrdStep.params?.action ?? "scherrer").trim();
  if (action !== "scherrer") {
    pushFail(fails, "p6-action", "action 应为 scherrer");
  }

  const peaksJson = String(xrdStep.params?.peaksJson ?? "").trim();
  if (!peaksJson) {
    pushFail(fails, "p6-peaks", "须提供 peaksJson，不得无数据调用 Scherrer");
  }

  const sectionKey = String(xrdStep.params?.sectionKey ?? "").trim();
  if (sectionKey && sectionKey !== "results") {
    pushFail(fails, "p6-section", "Scherrer 插入章节应为 results");
  }

  if (xrdStep.success === false) {
    pushFail(fails, "p6-success", "generate_xrd_analysis 应成功");
  } else if (xrdStep.data != null) {
    const mean = (xrdStep.data as { meanSizeNm?: unknown }).meanSizeNm;
    if (typeof mean !== "number" || !Number.isFinite(mean)) {
      pushFail(fails, "p6-mean-size", "observation 应含 meanSizeNm");
    }
  }

  const text = trace.finalText ?? "";
  if (!/Scherrer|晶粒|nm|纳米|尺寸/.test(text)) {
    pushFail(fails, "p6-final", "最终回复应提及 Scherrer / 晶粒尺寸");
  }
}

// ─── Golden / anti fixtures ─────────────────────────────────────────

const HIT_A = JSON.stringify({
  id: "doi:10.1/biochar",
  title: "Biochar soil amendment",
  authors: ["Zhang A"],
  year: 2023,
  journal: "Soil Biol",
  doi: "10.1/biochar",
  source: "openalex",
});

export const AGENT_SCRIPT_FIXTURES: {
  fixtureId: string;
  expectPass: boolean;
  trace: AgentScriptTrace;
}[] = [
  // P1 pass
  {
    fixtureId: "P1-pass-diagnose",
    expectPass: true,
    trace: {
      scriptId: "P1",
      goals: ["看看项目现在卡在哪，建议下一步"],
      tools: [
        { tool: "inspect_project", success: true },
        { tool: "read_project_asset", params: { asset: "outline" }, success: true },
      ],
      finalText: "当前缺口：还没有大纲。建议下一步先生成大纲，再写引言。",
    },
  },
  // P1 fail: premature write
  {
    fixtureId: "P1-fail-premature-write",
    expectPass: false,
    trace: {
      scriptId: "P1",
      goals: ["看看项目现在卡在哪，建议下一步"],
      tools: [
        {
          tool: "write_section",
          params: { section: "introduction" },
          success: true,
          data: { persisted: { sectionKey: "introduction" } },
        },
      ],
      finalText: "已写好引言。",
    },
  },
  // P2 pass
  {
    fixtureId: "P2-pass-import",
    expectPass: true,
    trace: {
      scriptId: "P2",
      goals: ["检索并导入 1 篇与「生物炭改良土壤」相关的文献"],
      tools: [
        {
          tool: "search_external",
          params: { query: "生物炭 土壤" },
          success: true,
          data: { items: [{ index: 1, hitJson: HIT_A, title: "Biochar soil amendment" }] },
        },
        {
          tool: "import_reference",
          params: {
            hitJson: HIT_A,
            query: "生物炭 土壤",
            why: "标题命中生物炭与土壤，与课题相关",
            userConfirmed: true,
          },
          success: true,
          data: { persisted: true, referenceCount: 1, relevanceScore: 0.6 },
        },
      ],
      hadConfirm: true,
      referenceCountBefore: 0,
      referenceCountAfter: 1,
      finalText: "已导入 1 篇参考文献（相关度 0.6）。",
    },
  },
  // P2 fail: no confirm / fabricated
  {
    fixtureId: "P2-fail-no-confirm",
    expectPass: false,
    trace: {
      scriptId: "P2",
      goals: ["检索并导入 1 篇与「生物炭改良土壤」相关的文献"],
      tools: [
        {
          tool: "search_external",
          success: true,
          data: { items: [{ hitJson: HIT_A }] },
        },
        {
          tool: "import_reference",
          params: { hitJson: HIT_A, userConfirmed: true },
          success: true,
          data: { persisted: true },
        },
      ],
      hadConfirm: false,
      referenceCountBefore: 0,
      referenceCountAfter: 1,
    },
  },
  // P3 pass
  {
    fixtureId: "P3-pass-intro",
    expectPass: true,
    trace: {
      scriptId: "P3",
      goals: ["写引言"],
      tools: [
        { tool: "inspect_project", success: true },
        { tool: "list_references", success: true },
        { tool: "read_project_asset", params: { asset: "outline" }, success: true },
        {
          tool: "write_section",
          params: { section: "introduction" },
          success: true,
          data: { persisted: { sectionKey: "introduction" }, charCount: 1200 },
        },
      ],
      finalText: "引言已写回，约 1200 字。建议下一步写方法。",
    },
  },
  // P3 fail: zero context
  {
    fixtureId: "P3-fail-zero-context",
    expectPass: false,
    trace: {
      scriptId: "P3",
      goals: ["写引言"],
      tools: [
        {
          tool: "write_section",
          params: { section: "introduction" },
          success: true,
          data: { persisted: { sectionKey: "introduction" } },
        },
      ],
      finalText: "写好了。",
    },
  },
  // P4 pass
  {
    fixtureId: "P4-pass-redirect",
    expectPass: true,
    trace: {
      scriptId: "P4",
      goals: ["写结果节", "先别写了，改大纲"],
      tools: [
        {
          tool: "read_section",
          params: { section: "results", __turn: 1 },
          success: true,
        },
        {
          tool: "generate_outline",
          params: { __turn: 2 },
          success: true,
          data: { persisted: true },
        },
      ],
      hadOutlineCheckpoint: true,
      finalText: "已根据你的意见准备新大纲，请确认修改要点。",
    },
  },
  // P4 fail: keep writing results
  {
    fixtureId: "P4-fail-keep-writing",
    expectPass: false,
    trace: {
      scriptId: "P4",
      goals: ["写结果节", "先别写了，改大纲"],
      tools: [
        {
          tool: "write_section",
          params: { section: "results", __turn: 1 },
          success: true,
          data: { persisted: { sectionKey: "results" } },
        },
        {
          tool: "write_section",
          params: { section: "results", __turn: 2 },
          success: true,
          data: { persisted: { sectionKey: "results" } },
        },
      ],
      finalText: "结果节已写完。",
    },
  },
  // P5 pass
  {
    fixtureId: "P5-pass-revision",
    expectPass: true,
    trace: {
      scriptId: "P5",
      goals: [
        "审稿意见：1) 讨论需补充局限 2) 语气过满。按意见改讨论部分",
      ],
      tools: [
        {
          tool: "parse_revision_comments",
          success: true,
          data: {
            items: [
              { id: "1", severity: "major", section: "discussion" },
              { id: "2", severity: "minor", section: "discussion" },
            ],
          },
        },
        {
          tool: "apply_revision_item",
          params: { itemId: "1", section: "discussion" },
          success: true,
          data: { persisted: { sectionKey: "discussion" } },
        },
      ],
      finalText: "已按 major 意见改写讨论并写回。",
    },
  },
  // P5 fail: parse only
  {
    fixtureId: "P5-fail-parse-only",
    expectPass: false,
    trace: {
      scriptId: "P5",
      goals: ["按意见改讨论部分"],
      tools: [
        {
          tool: "parse_revision_comments",
          success: true,
          data: { items: [{ id: "1", severity: "major" }] },
        },
      ],
      finalText: "路线图已生成，请自行修改。",
    },
  },
  // P6 pass — Scherrer from peaks
  {
    fixtureId: "P6-pass-scherrer",
    expectPass: true,
    trace: {
      scriptId: "P6",
      goals: [
        "峰位 26.64° FWHM 0.25°，请算 Scherrer 晶粒尺寸并插入 results",
      ],
      tools: [
        {
          tool: "generate_xrd_analysis",
          params: {
            action: "scherrer",
            peaksJson: '[{"two_theta":26.64,"fwhm":0.25}]',
            sectionKey: "results",
            title: "Scherrer 分析",
          },
          success: true,
          data: { meanSizeNm: 12.3, insertedSection: "results" },
        },
      ],
      finalText: "Scherrer 平均晶粒尺寸约 12.3 nm，已插入 results。",
    },
  },
  // P6 fail — no peaks
  {
    fixtureId: "P6-fail-no-peaks",
    expectPass: false,
    trace: {
      scriptId: "P6",
      goals: ["算 Scherrer 并插入 results"],
      tools: [
        {
          tool: "generate_xrd_analysis",
          params: { action: "scherrer", sectionKey: "results" },
          success: false,
          data: {},
        },
      ],
      finalText: "已估算晶粒尺寸。",
    },
  },
];

export function runAgentScriptCases(): AgentScriptCaseResult[] {
  return AGENT_SCRIPT_FIXTURES.map((fx) => {
    const failures = assertAgentScriptTrace(fx.trace);
    const passed = failures.length === 0;
    const ok = fx.expectPass ? passed : !passed;
    return {
      scriptId: fx.trace.scriptId,
      fixtureId: fx.fixtureId,
      expectPass: fx.expectPass,
      ok,
      failures: fx.expectPass
        ? failures
        : passed
          ? [{ code: "expected-fail", message: "反例轨迹竟通过了断言" }]
          : failures,
    };
  });
}

export function summarizeAgentScriptResults(results: AgentScriptCaseResult[]): {
  passed: number;
  failed: number;
  failures: AgentScriptCaseResult[];
} {
  const failures = results.filter((r) => !r.ok);
  return {
    passed: results.length - failures.length,
    failed: failures.length,
    failures,
  };
}

export function listAgentScriptIds(): AgentScriptId[] {
  return ["P1", "P2", "P3", "P4", "P5", "P6"];
}

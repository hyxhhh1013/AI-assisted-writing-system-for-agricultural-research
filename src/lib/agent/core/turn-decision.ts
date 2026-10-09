import { callAI } from "@/lib/ai";
import { resolveDecisionModel } from "@/lib/models";
import {
  applyWorkMemoryOp,
  type AgentWorkMemory,
} from "@/lib/agent/work-memory";

export const TURN_ACTIONS = [
  "write_section",
  "update_paper_config",
  "search_knowledge",
  "generate_outline",
  "generate_writing_blueprint",
  "ingest_project_data",
  "ask_user",
] as const;

export type TurnAction = (typeof TURN_ACTIONS)[number];

export interface TurnDecision {
  action: TurnAction;
  section?: string;
  subsectionTitle?: string;
  constraints: string[];
  stopAfter: true;
  note?: string;
}

export interface TurnDecisionInput {
  goal: string;
  decisions: string[];
  nextSection?: string | null;
  nextPath?: string | null;
  hasOutline: boolean;
  hasBlueprint: boolean;
}

const ACTION_SET = new Set<string>(TURN_ACTIONS);

const DECISION_SYSTEM = [
  "你是论文助手的决策层。只输出一个 JSON 对象。",
  "不要写正文，不要列多步计划，不要写 Plan。",
  "action 只能是：write_section、update_paper_config、search_knowledge、generate_outline、generate_writing_blueprint、ingest_project_data、ask_user。",
  "优先级：",
  "1. 用户点名某一节，或这句话已经是菜单选项展开后的正文 → write_section。section 用英文 key，subsectionTitle 用用户点的标题。",
  "2. 用户要改配置、题目、化学式、基质或语言 → update_paper_config，不要写正文。",
  "3. 用户要更多文献 → search_knowledge，不要写正文。",
  "4. 已有蓝图且用户说继续 → write_section，用给定的下一节。",
  "5. 没有大纲 → generate_outline；有大纲没有蓝图 → generate_writing_blueprint。然后停下。",
  "constraints 只放用户明确说过的限制。stopAfter 固定为 true。",
  "若这句话只是一个对不上选项的数字，action 用 ask_user。",
].join("\n");

export function parseTurnDecision(raw: string): TurnDecision | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj.action !== "string" || !ACTION_SET.has(obj.action)) return null;
    const constraints = Array.isArray(obj.constraints)
      ? obj.constraints.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 6)
      : [];
    const section = typeof obj.section === "string" ? obj.section.trim().slice(0, 40) : "";
    const subsectionTitle = typeof obj.subsectionTitle === "string" ? obj.subsectionTitle.trim().slice(0, 80) : "";
    const note = typeof obj.note === "string" ? obj.note.trim().slice(0, 200) : "";
    return {
      action: obj.action as TurnAction,
      ...(section ? { section } : {}),
      ...(subsectionTitle ? { subsectionTitle } : {}),
      constraints,
      stopAfter: true,
      ...(note ? { note } : {}),
    };
  } catch {
    return null;
  }
}

function namedSection(goal: string): { key: string; title?: string } | null {
  const pairs: Array<[RegExp, string]> = [
    [/引言|introduction/i, "introduction"],
    [/方法|methods/i, "methods"],
    [/结果|results/i, "results"],
    [/讨论|discussion/i, "discussion"],
    [/结论|conclusion/i, "conclusion"],
    [/摘要|abstract/i, "abstract"],
    [/研究现状|background/i, "background"],
  ];
  for (const [re, key] of pairs) {
    if (re.test(goal)) return { key };
  }
  return null;
}

export function fallbackTurnDecision(input: TurnDecisionInput): TurnDecision {
  const goal = input.goal.trim();
  if (/^[1-9１-９]$/.test(goal)) {
    return {
      action: "ask_user",
      constraints: [],
      stopAfter: true,
      note: "没有对上菜单选项。请直接说要写哪一节，或要检索、改配置。",
    };
  }
  const named = namedSection(goal);
  if (named) {
    return {
      action: "write_section",
      section: named.key,
      constraints: [],
      stopAfter: true,
    };
  }
  if (/(配置|题目|化学式|基质|语言).*(改|换|设|用)|改成(中文|英文)|全文用/.test(goal)) {
    return { action: "update_paper_config", constraints: [goal.slice(0, 80)], stopAfter: true };
  }
  if (/检索|导入文献|找文献|更多文献|补文献/.test(goal)) {
    return { action: "search_knowledge", constraints: [], stopAfter: true };
  }
  if (/大纲/.test(goal) && !input.hasOutline) {
    return { action: "generate_outline", constraints: [], stopAfter: true };
  }
  if (/蓝图/.test(goal) && !input.hasBlueprint) {
    return { action: "generate_writing_blueprint", constraints: [], stopAfter: true };
  }
  if (!input.hasOutline) {
    return { action: "generate_outline", constraints: [], stopAfter: true };
  }
  if (!input.hasBlueprint) {
    return { action: "generate_writing_blueprint", constraints: [], stopAfter: true };
  }
  if (/^(继续|接着写|往下写|好|好的|开始写)$/.test(goal) && input.nextSection) {
    return {
      action: "write_section",
      section: input.nextSection,
      ...(input.nextPath ? { subsectionTitle: input.nextPath } : {}),
      constraints: [],
      stopAfter: true,
    };
  }
  if (input.nextSection && /继续|接着/.test(goal)) {
    return {
      action: "write_section",
      section: input.nextSection,
      ...(input.nextPath ? { subsectionTitle: input.nextPath } : {}),
      constraints: [],
      stopAfter: true,
    };
  }
  return {
    action: "ask_user",
    constraints: [],
    stopAfter: true,
    note: "请说明下一步要写哪一节，或要改哪项配置。",
  };
}

export function formatTurnTask(decision: TurnDecision): string {
  const lines = ["【本轮任务】只做这一件事，做完停下。"];
  switch (decision.action) {
    case "write_section":
      lines.push(
        `写一节：${decision.section ?? "下一节"}${decision.subsectionTitle ? ` / ${decision.subsectionTitle}` : ""}。`,
      );
      break;
    case "update_paper_config":
      lines.push("只更新论文配置，不要写正文。");
      break;
    case "search_knowledge":
      lines.push("只检索并导入文献，不要写正文。");
      break;
    case "generate_outline":
      lines.push("只生成大纲，生成后停下等用户确认。");
      break;
    case "generate_writing_blueprint":
      lines.push("只生成写作蓝图，生成后停下等用户确认。");
      break;
    case "ingest_project_data":
      lines.push("只导入实验数据，不要写正文。");
      break;
    case "ask_user":
      lines.push(decision.note || "先问用户下一步，不要调用写作工具。");
      break;
    default:
      break;
  }
  if (decision.constraints.length) {
    lines.push(`约束：${decision.constraints.join("；")}`);
  }
  lines.push("不要自行追加检索、其它章节或机理图。");
  return lines.join("\n");
}

export function decisionsFromUserGoal(goal: string): string[] {
  const out: string[] = [];
  if (/不用管\s*Figure|不画机理图|不要机理图|不用画机理/.test(goal)) {
    out.push("用户要求：不画机理图");
  }
  if (/缺的数据先不管|数据先不用管|数据先不管/.test(goal)) {
    out.push("用户要求：缺的数据先不管");
  }
  const formula = goal.match(/Ba[₀-₉0-9.]*Al[₀-₉0-9A-Za-z₀-₉₊:：]*/);
  if (formula && /用|是|改|基质/.test(goal)) {
    out.push(`用户确认基质：${formula[0].slice(0, 80)}`);
  }
  return out;
}

export function appendGoalDecisions(
  prev: AgentWorkMemory | null | undefined,
  goal: string,
): { memory: AgentWorkMemory | null; changed: boolean } {
  const texts = decisionsFromUserGoal(goal).filter(
    (text) => !(prev?.decisions ?? []).some((item) => item.text === text),
  );
  let memory = prev ?? null;
  for (const text of texts) {
    memory = applyWorkMemoryOp(memory, { op: "add_decision", text });
  }
  return { memory, changed: texts.length > 0 };
}

export function stripStaleTurnMessages<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  const out: T[] = [];
  for (const message of messages) {
    if (message.role === "user" && message.content.startsWith("【本轮任务】")) continue;
    if (message.role === "assistant" && /^Plan:\r?\n/.test(message.content)) continue;
    if (message.role === "assistant" && message.content.includes("还有未完成步骤")) {
      const content = message.content.replace(/\n*——\n还有未完成步骤：[\s\S]*$/, "").trim();
      if (!content) continue;
      out.push({ ...message, content });
      continue;
    }
    out.push(message);
  }
  return out;
}

function decisionUserText(input: TurnDecisionInput): string {
  const lines = [`用户这句话：${input.goal.trim().slice(0, 500)}`];
  if (input.decisions.length) {
    lines.push(`已拍板：${input.decisions.slice(-6).join("；")}`);
  }
  lines.push(`大纲：${input.hasOutline ? "有" : "无"}；蓝图：${input.hasBlueprint ? "有" : "无"}`);
  if (input.nextPath || input.nextSection) {
    lines.push(`蓝图下一节：${input.nextPath || input.nextSection}`);
  }
  return lines.join("\n");
}

export async function requestTurnDecision(input: TurnDecisionInput): Promise<TurnDecision> {
  const fallback = fallbackTurnDecision(input);
  try {
    const model = await resolveDecisionModel();
    const response = await callAI({
      provider: "zhipu",
      model,
      stream: false,
      timeoutMs: 20_000,
      temperature: 0.2,
      messages: [
        { role: "system", content: DECISION_SYSTEM },
        { role: "user", content: decisionUserText(input) },
      ],
    });
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "";
    return parseTurnDecision(text) ?? fallback;
  } catch {
    return fallback;
  }
}

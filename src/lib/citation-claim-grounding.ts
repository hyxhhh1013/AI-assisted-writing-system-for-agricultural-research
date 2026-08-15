/**
 * W3-AP-CLAIM-GROUND — 引用级 grounding（claim 支撑判定）。
 *
 * 在「编号合法（citation-gate）+ 词重叠（citation-grounding）」之上加第三层：
 * 用 verifier LLM 逐条判断「含 [n] 的正文句」是否被该条文献支撑。
 * 判定分 support / contradict / neutral 三级；缺摘要/题录过短则跳过（skip）。
 *
 * judge 可注入：生产用 createLLMClaimJudge()，测试传 fake，避免依赖 API key。
 */

import { callAINonStreaming } from "@/lib/ai";
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";
import { extractCitationContext } from "@/lib/citation-grounding";
import { getAgentModelConfig } from "@/lib/models";
import type {
  ClaimGroundingInput,
  ClaimGroundingItem,
  ClaimGroundingReport,
  ClaimJudgeItem,
  ClaimJudgeVerdict,
  ClaimSupportJudge,
  ClaimSupportVerdict,
} from "@/contracts/citation-claim-grounding";

type Ref = ClaimGroundingInput["references"][number];

/** 题录/摘要合计少于此长度则无法判语义 */
const MIN_REF_TEXT_CHARS = 40;
/** 单次 LLM 调用最多送判条数（控制 latency / token） */
const DEFAULT_BATCH_SIZE = 8;

const VERDICTS: readonly ClaimSupportVerdict[] = ["support", "contradict", "neutral"];

function refCorpus(ref: Ref | undefined): string {
  if (!ref) return "";
  return [ref.title, ref.abstract, ref.content]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .join("\n");
}

function isGroundable(ref: Ref | undefined): boolean {
  if (!ref) return false;
  return refCorpus(ref).replace(/\s+/g, " ").trim().length >= MIN_REF_TEXT_CHARS;
}

function buildRefMap(references: Ref[]): Map<number, Ref> {
  const map = new Map<number, Ref>();
  for (const r of references) {
    const idx = Math.floor(Number(r.index));
    if (idx >= 1) map.set(idx, r);
  }
  return map;
}

export interface CitedSentence {
  number: number;
  sentence: string;
  ref: Ref | undefined;
}

/** 抽取每个 [n] 首次出现处的整句 + 对应文献（纯函数，供 judge 前准备） */
export function collectCitedSentences(
  draftText: string,
  references: Ref[],
): CitedSentence[] {
  const refMap = buildRefMap(references);
  const normalized = normalizeAllCitationFormats(draftText);
  const seen = new Set<number>();
  const out: CitedSentence[] = [];
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(normalized)) !== null) {
    const sentence = extractCitationContext(normalized, m.index);
    for (const num of expandCitationGroup(m[1])) {
      if (num < 1 || seen.has(num)) continue;
      seen.add(num);
      out.push({ number: num, sentence, ref: refMap.get(num) });
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** 从 LLM 返回文本里容错解析 JSON 数组 */
export function parseClaimVerdicts(
  text: string,
  expected: ClaimJudgeItem[],
): ClaimJudgeVerdict[] {
  const byNumber = new Map<number, ClaimJudgeVerdict>();
  try {
    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first >= 0 && last > first) {
      const raw = text.slice(first, last + 1);
      const parsed = JSON.parse(raw) as Array<{
        number?: unknown;
        verdict?: unknown;
        reason?: unknown;
      }>;
      for (const p of parsed) {
        const number = Math.floor(Number(p.number));
        if (!Number.isFinite(number) || number < 1) continue;
        const verdict = String(p.verdict ?? "").trim().toLowerCase();
        const v: ClaimSupportVerdict = (VERDICTS as readonly string[]).includes(
          verdict,
        )
          ? (verdict as ClaimSupportVerdict)
          : "neutral";
        byNumber.set(number, {
          number,
          verdict: v,
          reason: String(p.reason ?? "").slice(0, 200),
        });
      }
    }
  } catch {
    /* 解析失败：按 neutral 兜底 */
  }

  return expected.map((e) => {
    const hit = byNumber.get(e.number);
    return hit ?? { number: e.number, verdict: "neutral", reason: "判定解析失败，按中性兜底" };
  });
}

const CLAIM_JUDGE_SYSTEM = [
  "你是农业科研论文的引用核查器。给定若干「正文句」与它们引用的「参考文献（题录+摘要）」，逐条判断该句是否被该文献支撑。",
  "判定标准：",
  "- support：句子声称的事实/结论与文献内容一致，文献能支撑该表述；",
  "- contradict：句子与文献明显矛盾或张冠李戴（文献说的是另一件事/相反结论）；",
  "- neutral：句子是背景性/泛化表述，或摘要不足以确认支撑、但也不构成矛盾。",
  "只输出 JSON 数组，不要任何解释或代码围栏。格式：",
  '[{"number":1,"verdict":"support","reason":"文献报告了相似趋势"}]',
].join("\n");

function buildClaimJudgePrompt(items: ClaimJudgeItem[]): string {
  const lines = items.map((it) => {
    const sentence = it.citedSentence.slice(0, 300);
    const refText = it.refText.slice(0, 1500);
    return [
      `—— 条目 [${it.number}] ——`,
      `正文句：${sentence}`,
      `文献标题：${it.refTitle.slice(0, 200) || "（无）"}`,
      `文献摘要/题录：${refText || "（无）"}`,
    ].join("\n");
  });
  return `${lines.join("\n\n")}\n\n请对以上 ${items.length} 条逐一判定并输出 JSON 数组。`;
}

/** 生产 judge：用 verifier 角色 LLM 批量判定 */
export function createLLMClaimJudge(opts: {
  signal?: AbortSignal;
  userId?: string;
} = {}): ClaimSupportJudge {
  return async (items: ClaimJudgeItem[]): Promise<ClaimJudgeVerdict[]> => {
    if (items.length === 0) return [];
    const { provider } = getAgentModelConfig("verifier");
    const out: ClaimJudgeVerdict[] = [];
    for (const batch of chunk(items, DEFAULT_BATCH_SIZE)) {
      const text = await callAINonStreaming({
        provider,
        messages: [
          { role: "system", content: CLAIM_JUDGE_SYSTEM },
          { role: "user", content: buildClaimJudgePrompt(batch) },
        ],
        signal: opts.signal,
        userId: opts.userId,
        temperature: 0,
      });
      out.push(...parseClaimVerdicts(text, batch));
    }
    return out;
  };
}

function buildHint(report: Omit<ClaimGroundingReport, "hint">): string {
  const parts: string[] = [];
  if (report.judgedCount === 0) {
    parts.push("无可判条目（正文无 [n] 或文献均缺摘要/题录）");
  } else {
    const rate = report.supportRate != null ? `${Math.round(report.supportRate * 100)}%` : "—";
    parts.push(
      `claim 接地：${report.judgedCount} 条中 support ${report.supportCount}（${rate}）、`
      + `contradict ${report.contradictCount}、neutral ${report.neutralCount}`,
    );
  }
  if (report.skippedCount > 0) {
    parts.push(`${report.skippedCount} 条缺摘要/题录过短，跳过 claim 判定`);
  }
  if (report.contradictCount > 0) {
    const nums = report.items
      .filter((i) => i.verdict === "contradict")
      .slice(0, 5)
      .map((i) => i.number)
      .join(", ");
    parts.push(`contradict 需优先改引/改写：如 [${nums}]`);
  }
  return parts.join("；");
}

/**
 * 引用级 grounding 主入口：抽 claim → 送 judge → 聚合报告。
 * judge 缺省用 LLM；测试注入 fake 即可无 key 运行。
 */
export async function evaluateCitationClaimGrounding(
  input: ClaimGroundingInput,
  judge: ClaimSupportJudge,
): Promise<ClaimGroundingReport> {
  const cited = collectCitedSentences(input.draftText ?? "", input.references);
  const groundable = cited.filter((c) => isGroundable(c.ref));
  const skippedCount = cited.length - groundable.length;

  const judgeItems: ClaimJudgeItem[] = groundable.map((c) => ({
    number: c.number,
    citedSentence: c.sentence,
    refTitle: (c.ref?.title ?? "").trim(),
    refText: refCorpus(c.ref),
  }));

  const verdicts = judgeItems.length > 0 ? await judge(judgeItems) : [];
  const verdictByNumber = new Map(verdicts.map((v) => [v.number, v]));

  const items: ClaimGroundingItem[] = groundable.map((c) => {
    const v = verdictByNumber.get(c.number);
    return {
      number: c.number,
      citedSentence: c.sentence.slice(0, 160),
      refTitle: (c.ref?.title ?? "").trim().slice(0, 120) || undefined,
      verdict: v?.verdict ?? "neutral",
      reason: v?.reason ?? "未返回判定",
    };
  });

  const supportCount = items.filter((i) => i.verdict === "support").length;
  const contradictCount = items.filter((i) => i.verdict === "contradict").length;
  const neutralCount = items.filter((i) => i.verdict === "neutral").length;
  const judgedCount = items.length;

  const base = {
    judgedCount,
    supportCount,
    contradictCount,
    neutralCount,
    skippedCount,
    supportRate: judgedCount > 0 ? supportCount / judgedCount : null,
    items,
  };

  return { ...base, hint: buildHint(base) };
}

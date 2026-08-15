/**
 * 质量评测 LLM-judge（W3-AP-QUALITY-JUDGE）。
 *
 * 只给 `eval:quality` / 脚本用：对照确定性四维，看「改完变没变好」。
 * 禁止从 write_section / toolsNode 热路径调用。
 *
 * judge 可注入：测试传 fake；生产 `createLLMQualityJudge()` 用 verifier 角色。
 * 无 key / 超时 / 解析失败 → skipped，不把 CI 打红。
 */

import { callAINonStreaming } from "@/lib/ai";
import { getAgentModelConfig } from "@/lib/models";
import type {
  QualityEvalInput,
  QualityLlmDimensionKey,
  QualityLlmDimensionScore,
  QualityLlmReport,
  QualityPaperJudge,
} from "./types";

const LLM_KEYS: readonly QualityLlmDimensionKey[] = [
  "citation_support",
  "data_conclusion",
  "overclaim",
  "coherence",
];

export const QUALITY_LLM_LABELS: Record<QualityLlmDimensionKey, string> = {
  citation_support: "引用支撑",
  data_conclusion: "数据-结论",
  overclaim: "过度声称",
  coherence: "连贯",
};

const MAX_SECTION_CHARS = 1200;
const MAX_REF_CHARS = 400;
const MAX_REFS = 8;

const JUDGE_SYSTEM = [
  "你是学术论文质量评审（verifier）。只根据给定正文与题录打分，不要编造未出现的数据。",
  "只输出一个 JSON 对象，不要 markdown 围栏，不要解释。",
  "四个维度各给 0-100 整数分和一句中文 comment：",
  "citation_support：正文 [n] 是否被对应文献题录/摘要支撑，有无张冠李戴或越界。",
  "data_conclusion：结果中的数字/现象是否在结论/讨论中被回扣，有无数据-结论脱节。",
  "overclaim：结论语气是否克制（首创/完全解决/显著优于 等是否有依据）。",
  "coherence：章节之间是否连贯（方法→结果→讨论），有无自相矛盾。",
  '格式：{"citation_support":{"score":0,"comment":"..."},"data_conclusion":{"score":0,"comment":"..."},"overclaim":{"score":0,"comment":"..."},"coherence":{"score":0,"comment":"..."}}',
].join("\n");

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function formatPaperForJudge(input: QualityEvalInput): string {
  const title = input.title?.trim() || "（无标题）";
  const sections = input.sections
    .map((s) => `## ${s.title || s.key}\n${clip(s.content, MAX_SECTION_CHARS)}`)
    .join("\n\n");
  const refs = input.references.slice(0, MAX_REFS).map((r) => {
    const abs = clip(r.abstract || r.content || "", MAX_REF_CHARS);
    return `[${r.index}] ${r.title || ""} ${abs}`.trim();
  });
  return `标题：${title}\n\n${sections}\n\n参考文献：\n${refs.join("\n") || "（无）"}`;
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function emptySkipped(reason: string): QualityLlmReport {
  return {
    dimensions: [],
    overallScore: 0,
    skipped: true,
    skipReason: reason,
  };
}

/** 从 LLM 文本容错解析四维 JSON；失败返回 skipped。 */
export function parseQualityLlmJson(text: string): QualityLlmReport {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) {
    return emptySkipped("LLM 输出无法解析为 JSON 对象");
  }
  try {
    const raw = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    const dimensions: QualityLlmDimensionScore[] = [];
    for (const key of LLM_KEYS) {
      const block = raw[key];
      const rec =
        block && typeof block === "object"
          ? (block as Record<string, unknown>)
          : {};
      dimensions.push({
        key,
        label: QUALITY_LLM_LABELS[key],
        score: clampScore(rec.score ?? raw[`${key}_score`]),
        comment: typeof rec.comment === "string" ? rec.comment.trim() : "",
      });
    }
    const overallScore = Math.round(
      dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
    );
    return { dimensions, overallScore, skipped: false };
  } catch {
    return emptySkipped("LLM 输出 JSON 非法");
  }
}

export function createLLMQualityJudge(): QualityPaperJudge {
  return async (input: QualityEvalInput): Promise<QualityLlmReport> => {
    const { provider, keyError } = getAgentModelConfig("verifier");
    if (keyError) {
      return emptySkipped(keyError);
    }
    const text = await callAINonStreaming({
      provider,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: formatPaperForJudge(input) },
      ],
      temperature: 0,
    });
    return parseQualityLlmJson(text);
  };
}

/**
 * 跑 LLM-judge。未注入 judge 时走 verifier。
 * 任何抛错（无 key / 超时）都 skipped，不把调用方打红。
 */
export async function evaluateQualityLlm(
  input: QualityEvalInput,
  judge?: QualityPaperJudge,
): Promise<QualityLlmReport> {
  try {
    const run = judge ?? createLLMQualityJudge();
    return await run(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM judge 调用失败";
    return emptySkipped(message);
  }
}

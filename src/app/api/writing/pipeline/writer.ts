import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import type { WritingInput } from "@/lib/validations";
import {
  formatWritingBulletsForPrompt,
  MIN_WRITING_BULLETS,
  normalizeWritingBullets,
} from "@/contracts/writing";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WriterPhaseResult {
  initialDraft: string;
  finalDraft: string;
}

export async function runExpandBulletPhase(
  data: WritingInput,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
  signal: AbortSignal,
): Promise<WriterPhaseResult> {
  const { title, section, context, bullets, bulletIndex, draftSoFar, subsectionTitle } = data;
  const { systemPrompt, resolvedSectionPrompt } = prepared;
  const normalizedBullets = normalizeWritingBullets(bullets);
  const idx = bulletIndex ?? 0;

  if (idx < 0 || idx >= normalizedBullets.length) {
    throw new Error("bulletIndex 超出要点范围");
  }

  const otherBullets = normalizedBullets
    .map((b, i) => (i === idx ? null : `${i + 1}. ${b}`))
    .filter((line): line is string => line !== null)
    .join("\n");

  const adopted = draftSoFar?.trim() || "（本节尚无已采纳内容）";
  const userContent = `论文题目：${title}
当前写作章节：${section}${subsectionTitle ? `\n当前子节：${subsectionTitle}` : ""}

【本节已写入内容（请自然衔接，勿重复）】
${adopted}

【本条扩写要点（仅写这一条，1～3 个完整段落）】
${idx + 1}. ${normalizedBullets[idx]}

【其他要点（本条勿展开）】
${otherBullets || "（无）"}${context?.trim() ? `\n\n【补充说明】\n${context.trim()}` : ""}

指令：${resolvedSectionPrompt}`;

  emit({ type: "status", status: "writing" });
  emit({
    type: "pipeline_step",
    step: "writing",
    status: "running",
    detail: `扩写要点 ${idx + 1}/${normalizedBullets.length}…`,
  });

  const writerResponse = await callAI({
    provider: getAgentModelConfig("writer").provider,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    signal,
    timeoutMs: 300_000,
  });

  if (!writerResponse.ok || !writerResponse.body) {
    throw new Error("Writer 代理调用失败");
  }

  let bulletDraft = "";
  for await (const chunk of streamAIResponse(writerResponse, signal, 300_000)) {
    if (chunk.content) {
      bulletDraft += chunk.content;
      emit({ type: "delta", content: chunk.content });
    }
  }

  const trimmed = bulletDraft.trim();
  emit({
    type: "pipeline_step",
    step: "writing",
    status: "done",
    detail: `要点 ${idx + 1} 完成（${trimmed.length} 字）`,
  });
  emit({
    type: "bullet_done",
    bulletIndex: idx,
    content: trimmed,
    bulletCount: normalizedBullets.length,
  });
  await tick(60);

  return { initialDraft: trimmed, finalDraft: trimmed };
}

export async function runWriterPhase(
  data: WritingInput,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
  signal: AbortSignal,
): Promise<WriterPhaseResult> {
  const { title, section, context, bullets } = data;
  const { systemPrompt, resolvedSectionPrompt } = prepared;

  const normalizedBullets = normalizeWritingBullets(bullets);
  const userContent =
    normalizedBullets.length >= MIN_WRITING_BULLETS
      ? `论文题目：${title}\n当前写作章节：${section}\n本节扩写要点（须逐条覆盖，不得遗漏或合并无关内容）：\n${formatWritingBulletsForPrompt(normalizedBullets)}${
          context?.trim() ? `\n\n补充说明：${context.trim()}` : ""
        }\n\n指令：${resolvedSectionPrompt}`
      : `论文题目：${title}\n当前写作章节：${section}\n研究内容/上下文信息：${context}\n\n指令：${resolvedSectionPrompt}`;

  emit({ type: "status", status: "writing" });
  emit({ type: "pipeline_step", step: "writing", status: "running", detail: "AI 正在生成初稿..." });

  const writerResponse = await callAI({
    provider: getAgentModelConfig("writer").provider,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userContent,
      },
    ],
    signal,
    timeoutMs: 300_000,
  });

  if (!writerResponse.ok || !writerResponse.body) {
    throw new Error("Writer 代理调用失败");
  }

  let initialDraft = "";
  let finalDraft = "";
  for await (const chunk of streamAIResponse(writerResponse, signal, 300_000)) {
    if (chunk.content) {
      initialDraft += chunk.content;
      finalDraft += chunk.content;
      emit({ type: "delta", content: chunk.content });
    }
  }

  emit({ type: "pipeline_step", step: "writing", status: "done", detail: `初稿 ${initialDraft.length} 字` });
  await tick(60);

  return { initialDraft, finalDraft };
}

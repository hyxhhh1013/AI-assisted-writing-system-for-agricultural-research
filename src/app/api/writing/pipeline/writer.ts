import { callAI, getAgentModelConfig, streamAIResponse } from "@/lib/ai";
import type { WritingInput } from "@/lib/validations";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WriterPhaseResult {
  initialDraft: string;
  finalDraft: string;
}

export async function runWriterPhase(
  data: WritingInput,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
  signal: AbortSignal,
): Promise<WriterPhaseResult> {
  const { title, section, context } = data;
  const { systemPrompt, resolvedSectionPrompt } = prepared;

  emit({ type: "status", status: "writing" });
  emit({ type: "pipeline_step", step: "writing", status: "running", detail: "AI 正在生成初稿..." });

  const writerResponse = await callAI({
    provider: getAgentModelConfig("writer").provider,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `论文题目：${title}\n当前写作章节：${section}\n研究内容/上下文信息：${context}\n\n指令：${resolvedSectionPrompt}`,
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
  for await (const chunk of streamAIResponse(writerResponse, signal)) {
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

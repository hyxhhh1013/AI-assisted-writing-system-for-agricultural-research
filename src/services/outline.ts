/** POST /api/outline — 大纲 SSE 流 */

import type { OutlineInput } from "@/lib/validations";

/** 研究方向为空时回退为论文题目，便于新建综述项目直接生成 */
export function resolveOutlineResearchDirection(
  title: string,
  researchDirection?: string,
): string {
  const dir = researchDirection?.trim() ?? "";
  const t = title.trim();
  return dir || t;
}

type OutlineSsePayload = {
  error?: string;
  choices?: { delta?: { content?: string } }[];
};

async function readOutlineErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    /* 非 JSON 响应 */
  }
  return `生成失败 (${res.status})`;
}

function parseOutlineSseLine(line: string): OutlineSsePayload | null {
  const t = line.trim();
  if (!t || t === "data: [DONE]") return null;
  if (!t.startsWith("data:")) return null;
  try {
    return JSON.parse(t.slice(5).trim()) as OutlineSsePayload;
  } catch {
    return null;
  }
}

export async function streamOutline(
  input: OutlineInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const payload: OutlineInput = {
    ...input,
    researchDirection: resolveOutlineResearchDirection(
      input.title,
      input.researchDirection,
    ),
  };

  const res = await fetch("/api/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readOutlineErrorMessage(res));

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  if (!reader) throw new Error("无法读取大纲流");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const d = parseOutlineSseLine(line);
      if (!d) continue;
      if (d.error) throw new Error(d.error);
      const chunk = d.choices?.[0]?.delta?.content || "";
      if (chunk) {
        full += chunk;
        onChunk(full);
      }
    }
  }

  if (!full.trim()) {
    throw new Error("大纲内容为空，请检查 AI 配置或稍后重试");
  }
  return full;
}

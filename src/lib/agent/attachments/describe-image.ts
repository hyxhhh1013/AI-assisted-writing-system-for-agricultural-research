import fs from "fs";
import path from "path";
import { callAI } from "@/lib/ai";
import { MAX_ATTACHMENT_TEXT_CHARS } from "@/lib/agent/attachments/constants";

const IMAGE_PROMPT =
  "你是论文配图理解助手。请用中文输出固定结构：\n"
  + "类型：截图|表格|数据图|示意图|流程图\n"
  + "画面描述：≤3 句\n"
  + "文字内容：图中全部可读文字\n"
  + "数据与坐标轴：若有，列出轴名与关键数值，并用一句话说趋势\n"
  + "不要编造图中没有的信息。";

function mimeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif",
  };
  return map[ext] ?? "image/png";
}

/** 图片 → 结构化文本描述（GLM-4V）。无视觉 key 或失败降级 extract_failed。 */
export async function describeImage(
  filePath: string,
): Promise<{ status: "ready" | "extract_failed"; text?: string; truncated?: boolean; source: "image_vision" | "image_ocr"; error?: string }> {
  try {
    const data = fs.readFileSync(filePath).toString("base64");
    const response = await callAI({
      provider: "vision",
      messages: [
        { role: "system", content: IMAGE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "请理解这张图片：" },
            { type: "image_url", image_url: { url: `data:${mimeOf(filePath)};base64,${data}` } },
          ],
        },
      ],
      stream: false,
      timeoutMs: 30_000,
    });
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return { status: "extract_failed", source: "image_ocr", error: "视觉模型未返回内容" };
    return {
      status: "ready",
      text: content.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      truncated: content.length > MAX_ATTACHMENT_TEXT_CHARS,
      source: "image_vision",
    };
  } catch (err) {
    return {
      status: "extract_failed",
      source: "image_ocr",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

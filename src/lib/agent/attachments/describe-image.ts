import fs from "fs";
import path from "path";
import { callAI } from "@/lib/ai";
import { MAX_ATTACHMENT_TEXT_CHARS, MAX_VISION_IMAGE_BYTES } from "@/lib/agent/attachments/constants";

const IMAGE_PROMPT =
  "你是论文配图理解助手。请用中文输出固定结构：\n"
  + "类型：截图|表格|数据图|示意图|流程图\n"
  + "画面描述：≤3 句\n"
  + "文字内容：图中全部可读文字\n"
  + "数据与坐标轴：若有，列出轴名与关键数值，并用一句话说趋势\n"
  + "不要编造图中没有的信息。";

/** @deprecated 请从 `@/lib/agent/figure-qa` 导入；此处再导出保持旧 import 可用 */
export { FIGURE_QA_PROMPT } from "@/lib/agent/figure-qa";

function mimeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif",
  };
  return map[ext] ?? "image/png";
}

export interface VisionDescription {
  status: "ready" | "extract_failed";
  text?: string;
  truncated?: boolean;
  source: "image_vision" | "image_ocr";
  error?: string;
}

/** 用视觉模型理解一张图片 Buffer（PDF 渲染页、图片附件共用） */
export async function describeImageBuffer(
  data: Buffer,
  mime: string,
  prompt: string = IMAGE_PROMPT,
): Promise<VisionDescription> {
  try {
    const base64 = data.toString("base64");
    const response = await callAI({
      provider: "vision",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: "请理解这张图片：" },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
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

/** 图片附件 → 结构化文本描述。无视觉 key 或失败降级 extract_failed。 */
export async function describeImage(
  filePath: string,
  options?: { prompt?: string },
): Promise<VisionDescription> {
  try {
    if (fs.statSync(filePath).size > MAX_VISION_IMAGE_BYTES) {
      return { status: "extract_failed", source: "image_ocr", error: "图片过大，视觉模型暂不支持" };
    }
    return await describeImageBuffer(
      fs.readFileSync(filePath),
      mimeOf(filePath),
      options?.prompt ?? IMAGE_PROMPT,
    );
  } catch (err) {
    return {
      status: "extract_failed",
      source: "image_ocr",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

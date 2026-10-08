/**
 * 用视觉模型从图上读出可核对的数值。失败时不编造。
 */

import { describeImageBuffer } from "@/lib/agent/attachments/describe-image";
import { prepareFigureForVision } from "@/lib/agent/register-existing-figure";
import {
  parseFigureReadingsJson,
  type FigureReadingProposal,
} from "@/lib/agent/figure-reading-parse";

const READING_PROMPT =
  "你在读一张已经画好的实验图。只输出 JSON，不要其他文字。\n"
  + "{\n"
  + '  "note": "看不清的地方，一句话",\n'
  + '  "points": [\n'
  + '    {"series": "处理或系列名", "x": "横坐标标签，没有就空字符串", "y": "图上的数值，保留图中写法", "unit": "单位，没有就空字符串"}\n'
  + "  ]\n"
  + "}\n"
  + "只写图上能看清的点。看不清就不要编。示意图、流程图没有数据时 points 为空数组。最多 12 个点。";

export async function proposeFigureReadings(
  source: Buffer,
  fileName: string,
): Promise<FigureReadingProposal> {
  try {
    const prepared = await prepareFigureForVision(source, fileName);
    const described = await describeImageBuffer(prepared.data, prepared.mime, READING_PROMPT);
    if (described.status !== "ready" || !described.text) {
      return { note: described.error || "没有读出图中数字", points: [] };
    }
    return parseFigureReadingsJson(described.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读图失败";
    return { note: message.slice(0, 200), points: [] };
  }
}

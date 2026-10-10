/**
 * 蓝图每一行的写作档位。
 * step：这一节写完就停。together：与相邻的 together 合成一批，同一轮写完再停。
 */

import type { WritingPace } from "@/contracts/writing-blueprint";
import { mapToSectionForMode } from "@/lib/utils";

export type { WritingPace };

export function writingPaceLabel(pace: WritingPace): string {
  return pace === "together" ? "连着写" : "写完停";
}

/** 没手改过时的默认档：引言和结论连着写，其余写完停。 */
export function defaultWritingPace(
  path: string,
  mode?: "review" | "research",
): WritingPace {
  const key = mapToSectionForMode(path, mode);
  if (key === "introduction" || key === "conclusion") return "together";
  return "step";
}

function coercePaceToken(value: unknown): WritingPace | null {
  if (value === "together" || value === "step") return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/together|连着|一起|batch/.test(text)) return "together";
  if (/step|写完停|停/.test(text)) return "step";
  return null;
}

/** 与 writingOrder 等长。缺项、错位、中文说法都收成 step / together。 */
export function alignWritingPace(
  writingOrder: readonly string[],
  raw: unknown,
  mode?: "review" | "research",
): WritingPace[] {
  const incoming = Array.isArray(raw) ? raw : [];
  return writingOrder.map((path, index) => {
    return coercePaceToken(incoming[index]) ?? defaultWritingPace(path, mode);
  });
}

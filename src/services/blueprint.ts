/** POST /api/outline/blueprint — 写作蓝图 JSON */

import type { BlueprintInput } from "@/lib/validations";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";

async function readBlueprintErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    /* 非 JSON */
  }
  return `蓝图生成失败 (${res.status})`;
}

export async function generateWritingBlueprint(
  input: BlueprintInput,
): Promise<WritingBlueprint> {
  const res = await fetch("/api/outline/blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readBlueprintErrorMessage(res));
  }
  return res.json() as Promise<WritingBlueprint>;
}

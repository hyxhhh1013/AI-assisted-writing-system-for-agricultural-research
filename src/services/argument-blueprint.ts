/** POST /api/outline/argument-blueprint */

import type { ArgumentBlueprintInput } from "@/lib/validations";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    /* ignore */
  }
  return `论证蓝图生成失败 (${res.status})`;
}

export async function generateArgumentBlueprint(
  input: ArgumentBlueprintInput,
): Promise<ArgumentBlueprint> {
  const res = await fetch("/api/outline/argument-blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json() as Promise<ArgumentBlueprint>;
}

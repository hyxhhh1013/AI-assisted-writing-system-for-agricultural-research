/** POST /api/abstract/bilingual */

import type { BilingualAbstract } from "@/contracts/bilingual-abstract";
import type { BilingualAbstractInput } from "@/lib/validations";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    /* ignore */
  }
  return `双语摘要生成失败 (${res.status})`;
}

export async function generateBilingualAbstract(
  input: BilingualAbstractInput,
): Promise<BilingualAbstract> {
  const res = await fetch("/api/abstract/bilingual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json() as Promise<BilingualAbstract>;
}

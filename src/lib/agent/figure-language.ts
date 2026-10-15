/** 论文语言是英文时，图上由模型填写的文字不能是汉字。 */

const CJK = /[\u3400-\u9fff]/;

export function containsCjk(value: string): boolean {
  return CJK.test(value);
}

export function englishFigureTextError(
  fields: Record<string, string | undefined>,
): string | null {
  const hit = Object.entries(fields)
    .filter((entry): entry is [string, string] => Boolean(entry[1] && containsCjk(entry[1])))
    .map(([key]) => key);
  if (hit.length === 0) return null;
  return `论文语言是英文，这些图上文字仍是汉字：${hit.join("、")}。请改成英文后再出图。跟用户说话可以继续用中文。`;
}

export function parseDisplayNames(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const text = String(raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

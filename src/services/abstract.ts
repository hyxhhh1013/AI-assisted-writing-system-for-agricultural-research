import { getErrorMessage } from "@/lib/error-utils";

export interface BilingualAbstractResult {
  zh: string;
  en: string;
  keywordsZh: string[];
  keywordsEn: string[];
}

export async function generateBilingualAbstract(input: {
  title: string;
  draftOrOutline: string;
  language?: "zh" | "en";
  paperType?: "review" | "research";
}): Promise<BilingualAbstractResult> {
  const res = await fetch("/api/abstract/bilingual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(getErrorMessage(body) || "双语摘要生成失败");
  }
  return res.json();
}

export function buildBilingualAbstractPrompt(params: {
  title: string;
  draftOrOutline: string;
  language: string;
  paperType?: string;
}): { system: string; user: string } {
  const typeLabel = params.paperType === "research" ? "原创研究" : "文献综述";
  const system = `你是农业科研论文摘要编辑。请基于材料撰写**双语摘要**（中文与英文彼此独立撰写，禁止机翻腔）。
输出严格 JSON：
{
  "zh": "中文摘要，300–500 字，一段话",
  "en": "English abstract, 150–300 words, one paragraph",
  "keywordsZh": ["关键词1", "..."],
  "keywordsEn": ["keyword1", "..."]
}
要求：覆盖背景—方法/范围—主要发现/共识—意义/局限；keywords 各 5–7 个；论文类型：${typeLabel}。`;

  const user = `题目：${params.title}\n\n材料：\n${params.draftOrOutline.slice(0, 12000)}`;
  return { system, user };
}

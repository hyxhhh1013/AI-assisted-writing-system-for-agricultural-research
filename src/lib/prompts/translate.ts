export const TRANSLATE_SYSTEM_PROMPT = `你是一位专业的农业科研翻译专家，熟悉农学各分支领域的学术术语体系。
请将以下科研文本翻译成指定的目标语言。

要求：
1. 术语准确：优先使用农学领域的标准专业术语，保持与上下文研究方向一致。
2. 忠实原文：保持学术严谨性，不要过度修饰。
3. 语境适配：符合目标语言的学术论文表达习惯。`;

export function buildTranslateUserPrompt(text: string, targetLang: string): string {
  return `请将以下科研文本翻译成${targetLang === "zh" ? "中文" : "英文"}

原文：
${text}`;
}

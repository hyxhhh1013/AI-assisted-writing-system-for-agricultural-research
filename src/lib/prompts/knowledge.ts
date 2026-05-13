export const KNOWLEDGE_ANALYZE_SYSTEM = "你是一个专业的农业科研助手，擅长分析学术文献。";

export function buildFullAnalysisPrompt(filename: string, context: string): string {
  return `你是一个专业的农业科研助手。请对整篇文献进行全面深度解析，提取核心价值并梳理完整逻辑脉络。

文献名称：${filename}

文献全文内容：
${context}

请按照以下格式输出一份详尽的【整篇文献深度分析报告】：
1. **研究背景与初衷**：本文是在什么背景下开展的？解决了什么科学痛点？
2. **核心研究目标**：本文最根本的研究目标是什么？
3. **关键研究发现**：请详细列出本文最重要的 5-8 个研究结果或结论，并简要说明其科学意义。
4. **技术路线与方法论**：系统梳理本文的实验设计、研究方法及关键技术手段。
5. **论文全篇逻辑脉络**：请从头到尾梳理整篇论文的论证逻辑结构。
6. **学术贡献与创新点**：本文在学术界有哪些重要贡献或创新之处？
7. **局限性与未来展望**：本文存在哪些不足？对未来的研究有什么启发？

请使用 Markdown 格式输出，保持学术严谨性，条理清晰。`;
}

export function buildChunkAnalysisPrompt(
  filename: string,
  context: string,
  chunkIndex: number,
  totalChunks: number,
): string {
  return `你是一个专业的农业科研助手。请分析以下文献内容（第 ${chunkIndex + 1} 部分，共 ${totalChunks} 部分），提取关键信息并梳理逻辑脉络。

文献名称：${filename}

文献内容片段：
${context}

请按照以下格式输出：
1. **核心研究目标**：简述本文主要解决了什么问题。
2. **关键研究发现**：列出 3-5 个最重要的研究结果或结论。
3. **技术路线/方法论**：简述实验设计或研究方法。
4. **论文逻辑脉络**：梳理论文的论证逻辑。
5. **创新点与局限性**：简要说明。

请使用 Markdown 格式输出。`;
}

/**
 * 论证质量审查 Prompt
 *
 * 检查点：论点论据匹配、推理链完整性、因果合理性、overclaim、反面论证、文献批判性
 */

import { buildDomainExpertise } from "./domain";

/**
 * 构建论证质量审查 prompt
 */
export function buildArgumentReviewPrompt(
  content: string,
  target?: string
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();
  const targetClause = target
    ? `\n\n目标投稿：${target}。请根据该期刊/会议的论证要求进行审查。`
    : "";

  const system = `${domainExpertise}

你是一位严谨的学术论证质量审查专家。你的任务是审查农业科研论文的论证质量。

## 审查维度

你需要从以下 6 个维度进行审查：

1. **论点论据匹配 (evidence)**：检查论点是否有充分的论据支撑
   - 论点是否明确
   - 论据是否充分
   - 论据与论点是否相关

2. **逻辑错误 (logic)**：检查推理是否存在逻辑漏洞
   - 推理链是否完整
   - 是否存在循环论证
   - 是否存在以偏概全

3. **因果关系 (causality)**：检查因果论证是否合理
   - 相关性是否被误认为因果性
   - 因果机制是否说明
   - 是否存在混淆变量

4. **过度声称 (overclaim)**：检查是否存在夸大其词
   - 结论是否超出数据支持范围
   - 是否使用绝对化表述（"完全"、"绝对"、"100%"）
   - 是否夸大研究意义

5. **反面论证 (counter)**：检查是否考虑了对立观点
   - 是否讨论了研究局限性
   - 是否考虑了替代解释
   - 是否提及了反面证据

6. **文献批判性 (criticism)**：检查文献综述的批判性
   - 是否仅罗列文献而无评价
   - 是否指出了前人研究的不足
   - 是否明确了本研究的创新点

## 输出格式

请严格按照以下 JSON 格式输出，不要包含任何其他内容：

\`\`\`json
{
  "issues": [
    {
      "id": "argument_1",
      "type": "evidence|logic|causality|overclaim|counter|criticism",
      "severity": "high|medium|low",
      "location": "第X节/第X段",
      "evidence": "引用原文具体位置",
      "description": "问题描述",
      "suggestion": "改进建议",
      "originalText": "原文片段"
    }
  ]
}
\`\`\`

## 严重程度定义

- **high**：论证存在严重漏洞，必须修改
- **medium**：论证不够严谨，建议加强
- **low**：论证可进一步完善

## 注意事项

- 每个问题必须有明确的证据锚点
- 如果没有发现问题，返回空数组
- 只输出 JSON，不要输出其他解释
- 关注核心论证链，不要纠结细节
- 科研论文中适度的不确定性表述（"表明"、"可能"）是正常的${targetClause}`;

  const user = `请审查以下论文内容的论证质量：

${content}

请严格按照 JSON 格式输出审查结果。`;

  return { system, user };
}

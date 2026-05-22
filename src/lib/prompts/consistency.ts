export function buildConsistencyPrompt(params: {
  title: string;
  sections: { key: string; content: string }[];
  outline: string;
  dataClaims?: { id: string; text: string; values: Record<string, number | string> }[];
}): string {
  const sectionsText = params.sections
    .map((s) => `=== ${s.key} ===\n${s.content}`)
    .join("\n\n");

  const dataClaimsText = params.dataClaims && params.dataClaims.length > 0
    ? `\n已提取的数据证据声明（必须引用编号）：\n${params.dataClaims.map(c => `[${c.id}] ${c.text}`).join("\n")}\n`
    : "";

  return `你是农业学术论文一致性审查专家。检查论文各章节之间的逻辑一致性和术语连贯性。

论文题目：${params.title}

论文大纲：
${params.outline || "未提供"}
${dataClaimsText}
各章节内容：
${sectionsText}

请从以下六个方面进行全面审查：

1. **术语一致性**：同一概念在各章节是否使用统一名称（品种名、处理代号、测定指标名称等）。

2. **数据一致性**：各章节中引用的实验数据、统计结果是否相互矛盾。例如：Results 中报的均值/D/P值与 Discussion/Conclusion 中的引用是否一致。

3. **逻辑连贯性**：章节间逻辑衔接是否自然。Introduction 提出的问题 → Results 呈现的发现 → Discussion 的解释 → Conclusion 的总结是否形成闭环。

4. **结论-证据一致性**：Conclusion 的每一条结论是否都能在 Results 中找到对应数据支撑。是否存在结论超出了实际数据范围的情况。

5. **Overclaim 扫描**：扫描全文中是否存在以下措辞：
   - "首次" / "证明" / "最优" / "最好" / "前所未有" / "填补了空白"
   - Results 中是否混入了 Discussion 句式（"可能反映""或许由于""提示"等推测性措辞）
   - 如有 → 标记位置并建议替换

6. **引用一致性**：各章节的引用标注风格是否统一，引用编号是否与文献列表对应。

7. **数据溯源检查**：文中所有定量结论（数字、百分比、统计值）是否标注了数据来源编号（如 [D1-C3]）。如果存在没有数据编号的数值声明，标记为"未溯源数据"。如果证据声明列表中存在编号但正文中缺失该编号，标记为"缺失数据引用"。

【输出格式】—— 严格 JSON，不要其他内容：
{
  "passed": boolean,
  "issues": [
    {
      "type": "terminology" | "data" | "logic" | "conclusion" | "overclaim" | "citation",
      "severity": "high" | "medium" | "low",
      "sections": ["章节A", "章节B"],
      "description": "问题描述（包含具体措辞或数据）",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}`;
}

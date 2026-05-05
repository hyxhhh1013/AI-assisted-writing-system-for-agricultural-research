import { NextRequest } from "next/server";
import { callAI, getAIError } from "@/lib/ai";
import { buildConsistencyPrompt } from "@/lib/prompts";
import type { ConsistencyIssue, ConsistencyReport } from "@/types/consistency";

export async function POST(req: NextRequest) {
  try {
    const { title, sections, outline } = await req.json();

    if (!sections || !Array.isArray(sections) || sections.length < 2) {
      return new Response(
        JSON.stringify({ error: "需要至少 2 个章节内容才能进行一致性检查" }),
        { status: 400 },
      );
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const prompt = buildConsistencyPrompt({ title, sections, outline });

    const response = await callAI({
      provider: "deepseek",
      messages: [
        {
          role: "system",
          content: "你是一名严谨的学术论文一致性审查专家。严格按照输出格式返回 JSON。",
        },
        { role: "user", content: prompt },
      ],
      stream: false,
    });

    const rawText = await response.text();

    // 尝试从 AI 响应中提取 JSON
    let report: ConsistencyReport;
    try {
      // 先尝试直接解析
      report = JSON.parse(rawText);
    } catch {
      // 如果 AI 返回了 markdown 包裹的 JSON，提取代码块
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          report = JSON.parse(jsonMatch[1].trim());
        } catch {
          report = {
            passed: false,
            issues: [
              {
                type: "logic",
                severity: "medium",
                sections: [],
                description: "AI 响应格式异常",
                suggestion: "请重试一致性检查",
              },
            ],
            summary: rawText.slice(0, 500),
          };
        }
      } else {
        report = {
          passed: false,
          issues: [
            {
              type: "logic",
              severity: "medium",
              sections: [],
              description: "未能解析 AI 响应",
              suggestion: "请重试一致性检查",
            },
          ],
          summary: rawText.slice(0, 500),
        };
      }
    }

    return new Response(JSON.stringify(report), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Consistency Check Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

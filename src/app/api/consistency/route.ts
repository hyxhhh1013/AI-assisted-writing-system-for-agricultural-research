import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { callAI, getAIError } from "@/lib/ai";
import { buildConsistencyPrompt } from "@/lib/prompts";
import type { ConsistencyIssue, ConsistencyReport } from "@/types/consistency";
import { validateBody } from "@/lib/api-validate";
import { consistencySchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";

export async function POST(req: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(consistencySchema, await req.json());
    if (ve) return ve;

    const { title, sections, outline } = data;
    const dataClaims = (data.dataClaims ?? []) as {
      id: string; text: string; values: Record<string, string | number>;
    }[];

    const keyError = getAIError("deepseek");
    if (keyError) {
      return new Response(JSON.stringify({ error: keyError }), { status: 500 });
    }

    const prompt = buildConsistencyPrompt({ title, sections, outline, dataClaims });

    const response = await callAI({
      provider: "deepseek",
      messages: [
        {
          role: "system",
          content: "你是一名严谨的学术论文一致性审查专家。严格按照输出格式返回 JSON，不要包含任何其他内容。",
        },
        { role: "user", content: prompt },
      ],
      stream: false,
    });

    // 解析 OpenAI 格式的非流式响应：{ choices: [{ message: { content: "..." } }] }
    const rawJson = await response.json();
    const rawText: string =
      rawJson?.choices?.[0]?.message?.content || "";

    if (!rawText) {
      return new Response(
        JSON.stringify({
          passed: false,
          issues: [
            {
              type: "logic",
              severity: "medium",
              sections: [],
              description: "AI 未返回有效响应",
              suggestion: "请重试一致性检查",
            },
          ],
          summary: "空响应",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 尝试从 AI 响应中提取 JSON
    let report: ConsistencyReport;
    try {
      report = JSON.parse(rawText.trim());
    } catch {
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
                description: "AI 返回的 JSON 格式异常",
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
              description: "AI 未按 JSON 格式返回，请重试",
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
  } catch (error: unknown) {
    logger.error("Consistency Check Error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), { status: 500 });
  }
}
